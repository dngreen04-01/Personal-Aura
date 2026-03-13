const express = require('express');
const { handleMessage } = require('../agents/orchestrator');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { history, message, userContext } = req.body;
    const result = await handleMessage({ message, history, userContext });
    res.json(result);
  } catch (error) {
    console.error('Coach API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
