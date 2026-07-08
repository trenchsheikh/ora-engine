import { judgeDigest } from '../lib/judge.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { digest } = req.body || {};
    const verdict = await judgeDigest(digest);
    res.status(200).json(verdict);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Judge failed' });
  }
}
