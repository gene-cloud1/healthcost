// 스켈레톤 검증용 더미 저장소 — 서버리스 함수 재시작(콜드스타트) 시 초기화됨, 실제 DB 아님
let items = []

module.exports = function handler(req, res) {
  if (req.method === 'POST') {
    const value = req.body && req.body.value
    if (value) items.push(value)
    res.status(200).json({ items: items })
    return
  }
  res.status(200).json({ items: items })
}
