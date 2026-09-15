import * as sessionService from "../services/sessionService.js";

export async function statisticsHandler(req, res, next) {
  try {
    const stats = await sessionService.getStatistics(req.visitor._id);
    res.json({ ok: true, statistics: stats });
  } catch (err) {
    next(err);
  }
}