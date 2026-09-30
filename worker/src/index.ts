import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push'

type IntervalUnit = 'hour' | 'day' | 'month' | 'year'

interface ReminderConfig {
  id: string
  value: number
  unit: IntervalUnit
}

interface ItemPayload {
  id: string
  name: string
  intervalValue: number
  intervalUnit: IntervalUnit
  baseDate: string
  reminders: ReminderConfig[]
}

interface ItemRow {
  id: string
  device_id: string
  name: string
  interval_value: number
  interval_unit: IntervalUnit
  base_date: string
  reminders: string
  server_overdue_notified: number
  server_notified_reminder_ids: string
  subscription: string
}

export interface Env {
  DB: D1Database
  VAPID_SUBJECT: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  ALLOWED_ORIGIN: string
}

const UNIT_LABELS: Record<IntervalUnit, string> = {
  hour: '時間',
  day: '日',
  month: 'ヶ月',
  year: '年',
}

function addInterval(date: Date, value: number, unit: IntervalUnit): Date {
  const result = new Date(date)
  switch (unit) {
    case 'hour':
      result.setHours(result.getHours() + value)
      break
    case 'day':
      result.setDate(result.getDate() + value)
      break
    case 'month':
      result.setMonth(result.getMonth() + value)
      break
    case 'year':
      result.setFullYear(result.getFullYear() + value)
      break
  }
  return result
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  })
}

async function handleSubscribe(request: Request, env: Env, deviceId: string): Promise<Response> {
  let subscription: unknown
  try {
    subscription = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, env, 400)
  }

  await env.DB.prepare(
    `INSERT INTO devices (id, subscription, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(id) DO UPDATE SET subscription = excluded.subscription, updated_at = excluded.updated_at`,
  )
    .bind(deviceId, JSON.stringify(subscription), new Date().toISOString())
    .run()

  return json({ ok: true }, env)
}

async function handleReplaceItems(request: Request, env: Env, deviceId: string): Promise<Response> {
  let items: ItemPayload[]
  try {
    items = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, env, 400)
  }
  if (!Array.isArray(items)) {
    return json({ error: 'expected an array of items' }, env, 400)
  }

  const existing = await env.DB.prepare(
    'SELECT id, base_date, server_overdue_notified, server_notified_reminder_ids FROM items WHERE device_id = ?1',
  )
    .bind(deviceId)
    .all<{
      id: string
      base_date: string
      server_overdue_notified: number
      server_notified_reminder_ids: string
    }>()

  const existingById = new Map(existing.results.map((row) => [row.id, row]))

  const statements = [env.DB.prepare('DELETE FROM items WHERE device_id = ?1').bind(deviceId)]

  for (const item of items) {
    const prev = existingById.get(item.id)
    // A changed base_date means the item was reset — start the server's own
    // notified-state fresh so it can fire again for the new interval.
    const carryOver = prev && prev.base_date === item.baseDate
    statements.push(
      env.DB.prepare(
        `INSERT INTO items
           (id, device_id, name, interval_value, interval_unit, base_date, reminders,
            server_overdue_notified, server_notified_reminder_ids)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      ).bind(
        item.id,
        deviceId,
        item.name,
        item.intervalValue,
        item.intervalUnit,
        item.baseDate,
        JSON.stringify(item.reminders),
        carryOver ? prev.server_overdue_notified : 0,
        carryOver ? prev.server_notified_reminder_ids : '[]',
      ),
    )
  }

  await env.DB.batch(statements)
  return json({ ok: true }, env)
}

// web-push (the Node-oriented npm package) builds and sends the request
// itself via Node's `https.request` and `crypto.createECDH`, neither of
// which Workers' nodejs_compat fully implements — confirmed live via
// wrangler tail ("[unenv] https.request is not implemented yet!"). Every
// push send was failing (or, worse, silently producing an undecryptable
// payload the push service accepts but the device can't open) since
// nothing surfaced an error until a debug endpoint was added to test this
// in isolation. @block65/webcrypto-web-push builds the same RFC 8291
// VAPID-signed, encrypted request using only the Web Crypto API, which
// Workers fully supports natively — no Node polyfill involved.
async function sendPush(
  env: Env,
  subscriptionJson: string,
  payload: { title: string; body: string; tag: string },
): Promise<'sent' | 'gone' | 'failed'> {
  try {
    const subscription = JSON.parse(subscriptionJson)
    const vapid: VapidKeys = {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }
    const requestInit = await buildPushPayload(
      { data: JSON.stringify(payload), options: { ttl: 60 * 60 } },
      subscription,
      vapid,
    )
    const response = await fetch(subscription.endpoint, requestInit)
    if (response.status === 404 || response.status === 410) return 'gone'
    if (!response.ok) {
      console.error('Push send failed', response.status, await response.text())
      return 'failed'
    }
    return 'sent'
  } catch (error) {
    console.error('Push send failed', error)
    return 'failed'
  }
}

async function runDueCheck(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT items.*, devices.subscription as subscription
     FROM items JOIN devices ON items.device_id = devices.id`,
  ).all<ItemRow>()

  const now = new Date()
  const goneDeviceIds = new Set<string>()
  const updates: D1PreparedStatement[] = []

  for (const row of results) {
    if (goneDeviceIds.has(row.device_id)) continue

    const dueDate = addInterval(new Date(row.base_date), row.interval_value, row.interval_unit)
    const reminders: ReminderConfig[] = JSON.parse(row.reminders)
    const notifiedReminderIds: string[] = JSON.parse(row.server_notified_reminder_ids)

    if (now >= dueDate && !row.server_overdue_notified) {
      const result = await sendPush(env, row.subscription, {
        title: 'メンテナンス時期になりました',
        body: row.name,
        tag: `overdue-${row.id}`,
      })
      if (result === 'gone') {
        goneDeviceIds.add(row.device_id)
      } else if (result === 'sent') {
        updates.push(
          env.DB.prepare('UPDATE items SET server_overdue_notified = 1 WHERE id = ?1').bind(row.id),
        )
      }
    }

    for (const reminder of reminders) {
      if (notifiedReminderIds.includes(reminder.id)) continue
      const reminderTime = addInterval(dueDate, -reminder.value, reminder.unit)
      if (now >= reminderTime && now < dueDate) {
        const result = await sendPush(env, row.subscription, {
          title: 'もうすぐメンテナンス時期です',
          body: `${row.name}（あと${reminder.value}${UNIT_LABELS[reminder.unit]}）`,
          tag: `reminder-${reminder.id}`,
        })
        if (result === 'gone') {
          goneDeviceIds.add(row.device_id)
          break
        } else if (result === 'sent') {
          const nextIds = JSON.stringify([...notifiedReminderIds, reminder.id])
          updates.push(
            env.DB.prepare('UPDATE items SET server_notified_reminder_ids = ?1 WHERE id = ?2').bind(
              nextIds,
              row.id,
            ),
          )
        }
      }
    }
  }

  for (const deviceId of goneDeviceIds) {
    updates.push(env.DB.prepare('DELETE FROM devices WHERE id = ?1').bind(deviceId))
  }

  if (updates.length > 0) {
    await env.DB.batch(updates)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    const url = new URL(request.url)
    const match = url.pathname.match(/^\/devices\/([^/]+)\/(subscribe|items)$/)
    if (!match) {
      return json({ error: 'not found' }, env, 404)
    }
    const [, deviceId, resource] = match

    if (resource === 'subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env, deviceId)
    }
    // POST is what navigator.sendBeacon() requires (used so the sync
    // survives the page being torn down); PUT is kept for the fetch()
    // fallback path and any other manual calls.
    if (resource === 'items' && (request.method === 'POST' || request.method === 'PUT')) {
      return handleReplaceItems(request, env, deviceId)
    }
    return json({ error: 'method not allowed' }, env, 405)
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await runDueCheck(env)
  },
}
