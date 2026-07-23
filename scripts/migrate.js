const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/candi_connect',
  })
  await client.connect()

  if (process.argv.includes('--fresh')) {
    await client.query(`
      DROP TABLE IF EXISTS lead_actions, activity_log, follow_ups, enrollments, events, visits, leads, ad_spend_weekly, campaigns, users, clients CASCADE;
    `)
  }

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await client.query(sql)
  console.log('Migration applied.')
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
