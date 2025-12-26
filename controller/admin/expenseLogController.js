// controllers/expenseLogController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const throwError = require('../../utils/throwError');
const ExpenseLog = require('../../model/expenseLogModel');
const { getFileUrl } = require('../../utils/wasabi');

/* =============== Helpers =============== */
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

function requireAdmin(req) {
  if (req.user?.role !== 'admin') throwError('Hanya admin yang diizinkan', 403);
}

async function attachNotaUrls(doc) {
  if (!doc?.details?.length) return doc;

  const details = await Promise.all(
    doc.details.map(async (item) => {
      let nota_url = null;
      if (item.nota?.key) {
        try {
          nota_url = await getFileUrl(item.nota.key);
        } catch (_) {
          nota_url = null;
        }
      }
      return { ...item, nota_url };
    })
  );

  return { ...doc, details };
}

/* =============== Controllers =============== */

const getExpenseLogs = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const limit = parseInt(req.query.limit) || 20;
  const cursor = req.query.cursor;

  const filter = {};
  if (req.query.voucher_number)
    filter.voucher_number = req.query.voucher_number;
  if (req.query.payment_voucher)
    filter.payment_voucher = req.query.payment_voucher;
  if (req.query.project && isObjectId(req.query.project))
    filter.project = req.query.project;
  if (req.query.requester && isObjectId(req.query.requester))
    filter.requester = req.query.requester;

  if (cursor) filter.createdAt = { $lt: new Date(cursor) };

  const rows = await ExpenseLog.find(filter)
    .select('-details.nota')
    .populate('requester', 'name')
    .populate('project', 'project_name -_id')
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

  res.json({ data, nextCursor, hasMore });
});

const getExpenseLog = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { id } = req.params;
  if (!isObjectId(id)) throwError('ID tidak valid', 400);

  const log = await ExpenseLog.findById(id)
    .populate('requester', 'name')
    .populate('project', 'project_name')
    .lean();

  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  const withUrl = await attachNotaUrls(log);
  res.status(200).json(withUrl);
});

const refreshExpenseLogUrls = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { id } = req.params;
  if (!isObjectId(id)) throwError('ID tidak valid', 400);

  const log = await ExpenseLog.findById(id, { 'details.nota': 1 }).lean();
  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  const withUrl = await attachNotaUrls(log);

  res.status(200).json({
    details: (withUrl.details || []).map((it) => ({
      nota_url: it.nota_url || null
    }))
  });
});

const removeExpenseLog = asyncHandler(async (req, res) => {
  requireAdmin(req);

  const { id } = req.params;
  if (!isObjectId(id)) throwError('ID tidak valid', 400);

  const log = await ExpenseLog.findById(id);
  if (!log) throwError('Log laporan biaya tidak ditemukan!', 404);

  await log.deleteOne();

  res.status(200).json({ message: 'Log laporan biaya berhasil dihapus.' });
});

module.exports = {
  getExpenseLogs,
  getExpenseLog,
  refreshExpenseLogUrls,
  removeExpenseLog
};
