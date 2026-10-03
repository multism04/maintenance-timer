import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push'

type IntervalUnit = 'hour' | 'day' | 'month' | 'year'

interface ReminderConfig {
  id: string
  value: number
  unit: IntervalUnit
  // Exact notification instant, computed by the app. Absent only for data
  // synced by an older app version.
  at?: string
}

interface ItemPayload {
  id: string
  name: string
  intervalValue: number
  intervalUnit: IntervalUnit
  baseDate: string
  // Exact due instant, computed by the app (see the note in runDueCheck).
  dueAt?: string
  reminders: ReminderConfig[]
}

interface ItemRow {
  id: string
  device_id: string
  name: string
  interval_value: number
  interval_unit: IntervalUnit
  base_date: string
  due_at: string | null
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

const PERMISSION_VALUES = new Set(['granted', 'denied', 'default', 'unsupported'])

// The app reports its notification-permission state when it changes (or on
// first launch). Chrome can reset a site's permission on its own, which
// silently kills push delivery; recording each transition in push_log shows
// when and how often that happens.
async function handlePermissionEvent(request: Request, env: Env, deviceId: string): Promise<Response> {
  let body: { permission?: unknown; previous?: unknown; standalone?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, env, 400)
  }
  const permission = String(body.permission)
  if (!PERMISSION_VALUES.has(permission)) {
    return json({ error: 'invalid permission value' }, env, 400)
  }
  const previous = PERMISSION_VALUES.has(String(body.previous)) ? String(body.previous) : 'none'

  await logStatement(env, new Date().toISOString(), 'permission', {
    deviceId,
    result: permission,
    detail: `previous=${previous} standalone=${body.standalone === true}`,
  }).run()

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
    `SELECT id, base_date, due_at, server_overdue_notified, server_notified_reminder_ids
     FROM items WHERE device_id = ?1`,
  )
    .bind(deviceId)
    .all<{
      id: string
      base_date: string
      due_at: string | null
      server_overdue_notified: number
      server_notified_reminder_ids: string
    }>()

  const existingById = new Map(existing.results.map((row) => [row.id, row]))

  const statements = [env.DB.prepare('DELETE FROM items WHERE device_id = ?1').bind(deviceId)]

  for (const item of items) {
    const prev = existingById.get(item.id)
    // The server's own notified-state is kept only while the item is
    // unchanged. A new base_date means it was reset; a new due time means
    // its interval was edited (otherwise an item already notified as
    // overdue, then extended, would never notify again). A row stored
    // before due_at existed has null there — treat that as unchanged so the
    // first resync after upgrading doesn't re-fire already-sent
    // notifications.
    const carryOver =
      prev &&
      prev.base_date === item.baseDate &&
      (prev.due_at === null || prev.due_at === (item.dueAt ?? null))
    statements.push(
      env.DB.prepare(
        `INSERT INTO items
           (id, device_id, name, interval_value, interval_unit, base_date, due_at, reminders,
            server_overdue_notified, server_notified_reminder_ids)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      ).bind(
        item.id,
        deviceId,
        item.name,
        item.intervalValue,
        item.intervalUnit,
        item.baseDate,
        item.dueAt ?? null,
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
type SendResult = { result: 'sent' | 'gone' | 'failed'; detail: string }

async function sendPush(
  env: Env,
  subscriptionJson: string,
  payload: { title: string; body: string; tag: string },
): Promise<SendResult> {
  try {
    const subscription = JSON.parse(subscriptionJson)
    const vapid: VapidKeys = {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }
    // The server marks an item notified as soon as the push service accepts
    // the message (HTTP 201) and never retries, so a message the push
    // service later drops is lost for good. Two defaults would drop it:
    // a 1-hour ttl (phone off or offline for an hour = gone) and normal
    // urgency (Android defers normal-priority messages while the phone is
    // idle in Doze, and the 1-hour ttl then expires first). A reminder
    // should survive a day of that and wake the phone, hence these values.
    const requestInit = await buildPushPayload(
      {
        data: JSON.stringify(payload),
        options: { ttl: 24 * 60 * 60, urgency: 'high' },
      },
      subscription,
      vapid,
    )
    const response = await fetch(subscription.endpoint, requestInit)
    const detail = `HTTP ${response.status}`
    if (response.status === 404 || response.status === 410) return { result: 'gone', detail }
    if (!response.ok) {
      const body = await response.text()
      console.error('Push send failed', response.status, body)
      return { result: 'failed', detail: `${detail} ${body.slice(0, 200)}` }
    }
    return { result: 'sent', detail }
  } catch (error) {
    console.error('Push send failed', error)
    return { result: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

const LOG_RETENTION_DAYS = 30

function logStatement(
  env: Env,
  createdAt: string,
  kind: string,
  fields: { deviceId?: string; itemId?: string; itemName?: string; result?: string; detail?: string },
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO push_log (created_at, kind, device_id, item_id, item_name, result, detail)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(
    createdAt,
    kind,
    fields.deviceId ?? null,
    fields.itemId ?? null,
    fields.itemName ?? null,
    fields.result ?? null,
    fields.detail ?? null,
  )
}

async function runDueCheck(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT items.*, devices.subscription as subscription
     FROM items JOIN devices ON items.device_id = devices.id`,
  ).all<ItemRow>()

  const now = new Date()
  const nowIso = now.toISOString()
  const goneDeviceIds = new Set<string>()
  const updates: D1PreparedStatement[] = []
  let attempts = 0

  for (const row of results) {
    if (goneDeviceIds.has(row.device_id)) continue

    // Prefer the instants the app computed; the Worker's own addInterval
    // runs in UTC and only remains as a fallback for rows synced by an
    // older app version.
    const dueDate = row.due_at
      ? new Date(row.due_at)
      : addInterval(new Date(row.base_date), row.interval_value, row.interval_unit)
    const reminders: ReminderConfig[] = JSON.parse(row.reminders)
    const notifiedReminderIds: string[] = JSON.parse(row.server_notified_reminder_ids)

    if (now >= dueDate && !row.server_overdue_notified) {
      attempts++
      const { result, detail } = await sendPush(env, row.subscription, {
        title: 'メンテナンス時期になりました',
        body: row.name,
        tag: `overdue-${row.id}`,
      })
      updates.push(
        logStatement(env, nowIso, 'overdue', {
          deviceId: row.device_id,
          itemId: row.id,
          itemName: row.name,
          result,
          detail,
        }),
      )
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
      const reminderTime = reminder.at
        ? new Date(reminder.at)
        : addInterval(dueDate, -reminder.value, reminder.unit)
      if (now >= reminderTime && now < dueDate) {
        attempts++
        const { result, detail } = await sendPush(env, row.subscription, {
          title: 'もうすぐメンテナンス時期です',
          body: `${row.name}（あと${reminder.value}${UNIT_LABELS[reminder.unit]}）`,
          tag: `reminder-${reminder.id}`,
        })
        updates.push(
          logStatement(env, nowIso, 'reminder', {
            deviceId: row.device_id,
            itemId: row.id,
            itemName: `${row.name}（${reminder.value}${UNIT_LABELS[reminder.unit]}前）`,
            result,
            detail,
          }),
        )
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

  // Heartbeat row on every run, so "did the cron even run?" is answerable too.
  updates.push(
    logStatement(env, nowIso, 'cron', {
      result: 'ok',
      detail: `items=${results.length} attempts=${attempts} gone=${goneDeviceIds.size}`,
    }),
  )
  const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  updates.push(env.DB.prepare('DELETE FROM push_log WHERE created_at < ?1').bind(cutoff))

  await env.DB.batch(updates)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    const url = new URL(request.url)
    const match = url.pathname.match(/^\/devices\/([^/]+)\/(subscribe|items|permission)$/)
    if (!match) {
      return json({ error: 'not found' }, env, 404)
    }
    const [, deviceId, resource] = match

    if (resource === 'subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env, deviceId)
    }
    if (resource === 'permission' && request.method === 'POST') {
      return handlePermissionEvent(request, env, deviceId)
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
