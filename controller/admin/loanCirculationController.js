const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const LoanCirculation = require('../../model/loanCirculationModel');
const { getFileUrl } = require('../../utils/wasabi');

function pickImageMeta(item) {
  if (item?.product_image) return item.product_image;
  if (item?.product?.product_image) return item.product.product_image;
  return null;
}

function computeLoanStatus(borrowedItems = []) {
  if (!borrowedItems.length) return 'Sedang dipinjam';

  const statuses = borrowedItems.map((it) => it.item_status);

  const hasDipinjam = statuses.includes('Dipinjam');
  const hasDone = statuses.some((s) => s === 'Dikembalikan' || s === 'Hilang');

  if (hasDipinjam && hasDone) {
    return 'Dikembalikan sebagian';
  }

  if (!hasDipinjam) {
    return 'Selesai';
  }

  return 'Sedang dipinjam';
}

async function resolveImageUrl(meta) {
  try {
    if (!meta) return null;
    if (typeof meta === 'string') return meta;
    if (meta.key) return await getFileUrl(meta.key);
    return null;
  } catch {
    return null;
  }
}

async function attachImageUrls(circulation) {
  const doc = circulation?.toObject ? circulation.toObject() : circulation;

  if (Array.isArray(doc.borrowed_items) && doc.borrowed_items.length) {
    doc.borrowed_items = await Promise.all(
      doc.borrowed_items.map(async (it) => {
        const meta = pickImageMeta(it);
        const product_image_url = await resolveImageUrl(meta);
        return { ...it, product_image_url };
      })
    );
  }
  return doc;
}

const getLoanCirculations = asyncHandler(async (req, res) => {
  const mode = req.query.mode || 'paging';
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const { search, sort } = req.query;

  const filter = {};
  if (search) {
    filter.$or = [
      { loan_number: { $regex: search, $options: 'i' } },
      { inventory_manager: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [f, o] = String(sort).split(':');
    sortOption = { [f]: o === 'asc' ? 1 : -1 };
  }

  const baseQuery = LoanCirculation.find(filter)
    .select(
      '_id loan_number borrower inventory_manager phone loan_date_circulation borrowed_items.item_status createdAt'
    )
    .populate('borrower', 'name');

  if (mode === 'paging') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const totalItems = await LoanCirculation.countDocuments(filter);
    const rows = await baseQuery
      .skip(skip)
      .limit(limit)
      .sort(sortOption)
      .lean();

    const data = rows.map((row) => ({
      _id: row._id,
      loan_number: row.loan_number,
      loan_status: computeLoanStatus(row.borrowed_items),
      borrower: row.borrower?.name || null,
      inventory_manager: row.inventory_manager,
      phone: row.phone,
      loan_date_circulation: row.loan_date_circulation
    }));

    return res.json({
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      sort: sortOption,
      data
    });
  }

  if (mode === 'cursor') {
    if (req.query.cursor)
      filter.createdAt = { $lt: new Date(req.query.cursor) };

    const rows = await baseQuery
      .sort(sortOption)
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const data = sliced.map((row) => ({
      _id: row._id,
      loan_number: row.loan_number,
      loan_status: computeLoanStatus(row.borrowed_items),
      borrower: row.borrower?.name || null,
      inventory_manager: row.inventory_manager,
      phone: row.phone,
      loan_date_circulation: row.loan_date_circulation
    }));

    return res.json({
      data,
      nextCursor: hasMore ? sliced[sliced.length - 1].createdAt : null,
      hasMore
    });
  }

  throwError('mode pagination tidak valid', 400);
});

const getLoanCirculation = asyncHandler(async (req, res) => {
  const row = await LoanCirculation.findById(req.params.id)
    .populate('borrowed_items.warehouse_from', 'warehouse_name warehouse_code')
    .populate('borrowed_items.shelf_from', 'shelf_name shelf_code')
    .populate('borrowed_items.project', 'project_name')
    .populate('borrowed_items.product', 'product_code brand product_image')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('borrower', 'name')
    .lean();

  if (!row) throwError('Sirkulasi tidak terdaftar!', 404);

  const withUrl = await attachImageUrls(row);
  res.status(200).json(withUrl);
});

const refreshLoanCirculationUrls = asyncHandler(async (req, res) => {
  const row = await LoanCirculation.findById(req.params.id)
    .populate('borrowed_items.product', 'product_image product_code brand')
    .lean();
  if (!row) throwError('Sirkulasi tidak terdaftar!', 404);

  const withUrl = await attachImageUrls(row);

  res.status(200).json({
    loan_number: row.loan_number,
    borrowed_items: (withUrl.borrowed_items || []).map((it) => ({
      _id: it._id,
      product_code: it.product_code,
      brand: it.brand,
      product_image_url: it.product_image_url
    }))
  });
});

const removeLoanCirculation = asyncHandler(async (req, res) => {
  const row = await LoanCirculation.findById(req.params.id);
  if (!row) throwError('Sirkulasi tidak terdaftar!', 404);

  await row.deleteOne();
  res.status(200).json({ message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getLoanCirculations,
  getLoanCirculation,
  refreshLoanCirculationUrls,
  removeLoanCirculation
};
