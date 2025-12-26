const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const ProductCirculation = require('../../model/productCirculationModel');

const getProductCirculations = asyncHandler(async (req, res) => {
  const mode = req.query.mode || 'paging';
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const {
    product_code,
    warehouse_from,
    warehouse_to,
    moved_by_name,
    movement_type,
    search,
    sort
  } = req.query;

  const filter = {};
  if (product_code)
    filter.product_code = { $regex: product_code, $options: 'i' };
  if (warehouse_from) filter.warehouse_from = warehouse_from;
  if (warehouse_to) filter.warehouse_to = warehouse_to;
  if (moved_by_name)
    filter.moved_by_name = { $regex: moved_by_name, $options: 'i' };
  if (movement_type) filter.movement_type = movement_type;

  if (search) {
    filter.$or = [
      { product_code: { $regex: search, $options: 'i' } },
      { product_name: { $regex: search, $options: 'i' } },
      { moved_by_name: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [f, o] = String(sort).split(':');
    sortOption = { [f]: o === 'asc' ? 1 : -1 };
  }

  const baseQuery = ProductCirculation.find(filter)
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .populate('moved_by', 'name');

  if (mode === 'paging') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const totalItems = await ProductCirculation.countDocuments(filter);
    const rows = await baseQuery
      .skip(skip)
      .limit(limit)
      .sort(sortOption)
      .lean();

    return res.json({
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      sort: sortOption,
      data: rows
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
    const data = hasMore ? rows.slice(0, limit) : rows;

    return res.json({
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt : null,
      hasMore
    });
  }

  throwError('mode pagination tidak valid', 400);
});

// GET /product-circulations/:id
const getProductCirculation = asyncHandler(async (req, res) => {
  const row = await ProductCirculation.findById(req.params.id)
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('shelf_from', 'shelf_name shelf_code')
    .populate('shelf_to', 'shelf_name shelf_code')
    .populate('product', 'product_name product_code')
    .populate('moved_by', 'name')
    .lean();

  if (!row) throwError('Sirkulasi tidak ditemukan', 404);

  const labelMovement = (code) => {
    switch (code) {
      case 'LOAN_OUT':
        return 'Peminjaman (barang keluar)';
      case 'RETURN_IN':
        return 'Pengembalian (barang masuk)';
      case 'TRANSFER':
        return 'Transfer antar gudang';
      case 'CONDITION_CHANGE':
        return 'Perubahan kondisi';
      case 'REOPEN_LOAN':
        return 'Buka ulang data peminjaman';
      default:
        return code || '-';
    }
  };

  const data = {
    _id: row._id,
    date: row.createdAt,
    movement_code: row.movement_type,
    movement: labelMovement(row.movement_type),
    product: {
      code: row.product?.product_code || row.product_code || null,
      name: row.product?.product_name || row.product_name || null
    },
    qty: row.quantity,
    from: {
      warehouse: row.warehouse_from?.warehouse_name || null,
      warehouse_code: row.warehouse_from?.warehouse_code || null,
      shelf: row.shelf_from?.shelf_name || null,
      shelf_code: row.shelf_from?.shelf_code || null
    },
    to: {
      warehouse: row.warehouse_to?.warehouse_name || null,
      warehouse_code: row.warehouse_to?.warehouse_code || null,
      shelf: row.shelf_to?.shelf_name || null,
      shelf_code: row.shelf_to?.shelf_code || null
    },
    condition: {
      from: row.from_condition || row.condition || null,
      to: row.to_condition || null
    },
    document_number: row.loan_number || null,
    actor_name: row.moved_by_name || null,
    note: row.reason_note || null
  };

  res.status(200).json({ success: true, data });
});

// (opsional) DELETE /product-circulations/remove/:id
const removeProductCirculation = asyncHandler(async (req, res) => {
  const row = await ProductCirculation.findById(req.params.id);
  if (!row) throwError('Sirkulasi tidak ditemukan!', 404);
  await row.deleteOne();
  res
    .status(200)
    .json({ success: true, message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getProductCirculations,
  getProductCirculation,
  removeProductCirculation
};
