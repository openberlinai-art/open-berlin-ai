// List + notification CRUD for D1

import type { D1Database } from '@cloudflare/workers-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListRow {
  id:          string
  user_id:     string
  name:        string
  description: string | null
  is_public:   number
  created_at:  string
}

export interface ListItemRow {
  id:        string
  list_id:   string
  item_type: 'event' | 'location'
  item_id:   string
  notes:     string | null
  added_at:  string
}

export interface NotificationRow {
  id:         string
  user_id:    string
  type:       string
  data:       string   // JSON
  read:       number
  created_at: string
}

// ─── Lists ────────────────────────────────────────────────────────────────────

export async function getLists(userId: string, db: D1Database): Promise<ListRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM lists WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all<ListRow>()
  return results
}

export async function getList(id: string, db: D1Database): Promise<ListRow | null> {
  return db.prepare(`SELECT * FROM lists WHERE id = ?`).bind(id).first<ListRow>()
}

export async function createList(
  userId: string,
  name: string,
  description: string | null,
  isPublic: boolean,
  db: D1Database,
): Promise<ListRow> {
  const id = crypto.randomUUID()
  await db
    .prepare(`INSERT INTO lists (id, user_id, name, description, is_public) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, userId, name, description ?? null, isPublic ? 1 : 0)
    .run()
  return { id, user_id: userId, name, description: description ?? null, is_public: isPublic ? 1 : 0, created_at: new Date().toISOString() }
}

export async function updateList(
  id: string,
  userId: string,
  fields: { name?: string; description?: string; is_public?: boolean },
  db: D1Database,
): Promise<boolean> {
  const sets: string[] = []
  const values: unknown[] = []
  if (fields.name !== undefined)        { sets.push('name = ?');        values.push(fields.name) }
  if (fields.description !== undefined) { sets.push('description = ?'); values.push(fields.description) }
  if (fields.is_public !== undefined)   { sets.push('is_public = ?');   values.push(fields.is_public ? 1 : 0) }
  if (!sets.length) return false
  values.push(id, userId)
  const { meta } = await db
    .prepare(`UPDATE lists SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run()
  return (meta.changes ?? 0) > 0
}

export async function deleteList(id: string, userId: string, db: D1Database): Promise<boolean> {
  const { meta } = await db
    .prepare(`DELETE FROM lists WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run()
  return (meta.changes ?? 0) > 0
}

// ─── List items ───────────────────────────────────────────────────────────────

export async function getListItems(listId: string, db: D1Database): Promise<ListItemRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM list_items WHERE list_id = ? ORDER BY added_at DESC`)
    .bind(listId)
    .all<ListItemRow>()
  return results
}

export async function addListItem(
  listId: string,
  itemType: 'event' | 'location',
  itemId: string,
  notes: string | null,
  db: D1Database,
): Promise<ListItemRow> {
  const id = crypto.randomUUID()
  await db
    .prepare(`INSERT INTO list_items (id, list_id, item_type, item_id, notes)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(list_id, item_type, item_id) DO UPDATE SET notes = excluded.notes`)
    .bind(id, listId, itemType, itemId, notes ?? null)
    .run()
  return { id, list_id: listId, item_type: itemType, item_id: itemId, notes: notes ?? null, added_at: new Date().toISOString() }
}

export async function removeListItem(itemId: string, listId: string, db: D1Database): Promise<boolean> {
  const { meta } = await db
    .prepare(`DELETE FROM list_items WHERE id = ? AND list_id = ?`)
    .bind(itemId, listId)
    .run()
  return (meta.changes ?? 0) > 0
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(userId: string, db: D1Database): Promise<NotificationRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(userId)
    .all<NotificationRow>()
  return results
}

export async function createNotification(
  userId: string,
  type: string,
  data: Record<string, unknown>,
  db: D1Database,
): Promise<void> {
  const id = crypto.randomUUID()
  await db
    .prepare(`INSERT INTO notifications (id, user_id, type, data) VALUES (?, ?, ?, ?)`)
    .bind(id, userId, type, JSON.stringify(data))
    .run()
}

export async function markNotificationRead(
  id: string,
  userId: string,
  db: D1Database,
): Promise<boolean> {
  const { meta } = await db
    .prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run()
  return (meta.changes ?? 0) > 0
}

export async function markAllNotificationsRead(userId: string, db: D1Database): Promise<void> {
  await db
    .prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`)
    .bind(userId)
    .run()
}
