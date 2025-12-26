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

  const mode = req.query.mode || 'paging';
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const filter = {};
  if (req.query.voucher_number)
    filter.voucher_number = req.query.voucher_number;
  if (req.query.payment_voucher)
    filter.payment_voucher = req.query.payment_voucher;
  if (req.query.project && isObjectId(req.query.project))
    filter.project = req.query.project;
  if (req.query.requester && isObjectId(req.query.requester))
    filter.requester = req.query.requester;

  const baseQuery = ExpenseLog.find(filter)
    .select('-details.nota')
    .populate('requester', 'name')
    .populate('project', 'project_name -_id');

  if (mode === 'paging') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const totalItems = await ExpenseLog.countDocuments(filter);
    const data = await baseQuery
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      data
    });
  }

  if (mode === 'cursor') {
    if (req.query.cursor)
      filter.createdAt = { $lt: new Date(req.query.cursor) };
    const rows = await baseQuery
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return res.json({
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt : null,
      hasMore
    });
  }

  throwError('mode pagination tidak valid', 400);
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
