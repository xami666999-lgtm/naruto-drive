const express = require('express')
const { seasons, episodes, DRIVE } = require('./naruto')
const app = express()
const PORT = process.env.PORT || 7100

const manifest = {
  id: 'com.naruto.drive',
  version: '1.0.0',
  name: 'Naruto Drive',
  description: 'Naruto episodes from Google Drive. Childhood, Gaiden, Kakashi, Shippuden, Senjou, Itachi, Hiden, Next Generations, Boruto.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  catalogs: [
    { type: 'series', id: 'naruto', name: 'Naruto', extra: [{ name: 'search', isRequired: false }] },
  ],
  idPrefixes: ['naruto'],
}

app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next() })

app.get('/manifest.json', (_req, res) => res.json(manifest))

app.get('/catalog/series/naruto.json', (req, res) => {
  const q = (req.query.search || '').toLowerCase()
  const metas = seasons
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .map((s) => ({ id: 'naruto:' + s.id, type: 'series', name: s.name, poster: s.poster }))
  res.json({ metas })
})

app.get('/meta/series/:id.json', (req, res) => {
  const sid = req.params.id.replace('naruto:', '')
  const season = seasons.find((s) => s.id === sid)
  if (!season) return res.json({ meta: { id: req.params.id, type: 'series', name: 'Naruto' } })
  const eps = (episodes[sid] || []).map((e, i) => ({
    id: 'naruto:' + sid + ':' + e[0],
    title: e[1],
    season: 1,
    episode: i + 1,
    overview: e[3] || '',
  }))
  res.json({ meta: { id: req.params.id, type: 'series', name: season.name, poster: season.poster, videos: eps } })
})

function base(req) {
  const host = req.get('host')
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  return proto + '://' + host
}

app.get('/stream/series/:id.json', (req, res) => {
  const parts = req.params.id.split(':')
  if (parts[0] !== 'naruto') return res.json({ streams: [] })
  const ep = (episodes[parts[1]] || []).find((e) => e[0] === parts[2])
  if (!ep) return res.json({ streams: [] })
  res.json({ streams: [{ name: 'Naruto', title: ep[1], url: base(req) + '/play/' + ep[2] }] })
})

app.get('/play/:fileId', async (req, res) => {
  try {
    const id = req.params.fileId
    const warn = await fetch('https://drive.google.com/uc?export=download&id=' + id, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const html = await warn.text()
    const uuid = (html.match(/name="uuid" value="([^"]+)"/) || [])[1] || ''
    const url = 'https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t' + (uuid ? '&uuid=' + uuid : '')
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } })
    const disp = r.headers.get('content-disposition') || ''
    const name = (disp.match(/filename="([^"]+)"/) || [])[1] || ''
    const type = /\.mkv/i.test(name) ? 'video/x-matroska' : /\.mp4|\.m4v/i.test(name) ? 'video/mp4' : (r.headers.get('content-type') || 'video/mp4')
    res.set('Content-Type', type)
    res.set('Accept-Ranges', 'bytes')
    if (r.headers.get('content-length')) res.set('Content-Length', r.headers.get('content-length'))
    const { Readable } = require('stream')
    Readable.fromWeb(r.body).pipe(res)
  } catch (err) {
    res.status(502).send('stream failed')
  }
})

app.get('/', (_req, res) => res.redirect('/manifest.json'))
app.listen(PORT, () => console.log('Naruto Drive addon on', PORT))
