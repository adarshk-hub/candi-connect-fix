import { NextResponse } from 'next/server'

// A logged-in browser session (JWT cookie) encodes a user id at login time.
// If that user row is later deleted — most commonly because the database
// was reseeded/reset while the browser tab stayed open — every insert that
// stamps created_by/actor_id/sent_by with session.id fails with a foreign
// key violation (Postgres code 23503). Left unhandled, that crashes the
// route with a raw 500 and no body, which the client can only report as a
// generic "Failed to save" with no indication of what actually went wrong.
// Catching it here turns that dead end into an actionable message.
export function handleWriteError(err: any): NextResponse {
  if (err?.code === '23503' && String(err?.constraint || '').match(/created_by|actor_id|sent_by|triggered_by|entered_by/)) {
    return NextResponse.json(
      { error: 'Your session is out of date. Please log out and log back in, then try again.' },
      { status: 401 }
    )
  }
  console.error(err)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}
