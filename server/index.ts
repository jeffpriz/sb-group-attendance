import path from 'node:path'
import { createApp } from './app.ts'

const port = Number(process.env.PORT ?? 3001)
const dataDir = path.resolve(process.env.DATA_DIR ?? 'data')
const staticDir = path.resolve('dist')

const app = createApp({ dataDir, staticDir })

app.listen(port, () => {
  console.log(`SB Group Attendance server listening on http://localhost:${port}`)
  console.log(`Saving data in ${dataDir}`)
})
