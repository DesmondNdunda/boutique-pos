import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { Prisma } from "@prisma/client";
import { requireRole } from "../../middleware/rbac";
import { branchForRequest } from "../../middleware/branchAccess";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

// GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=
reportsRouter.get("/summary", requireRole("OWNER", "MANAGER"), asyncHandler(async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const branchId = (req.query.branchId as string) ?? req.auth!.branchId ?? undefined;
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : new Date(new Date().setDate(new Date().getDate() - 29));
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : new Date();
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return res.status(400).json({ error: "Invalid date range" });
  const sales = await prisma.sale.findMany({
    where: { organizationId, branchId, status: "COMPLETED", createdAt: { gte: from, lte: to } },
    select: { id: true, total: true, createdAt: true, payments: { where: { status: "SUCCESS" }, select: { method: true, amount: true } } },
    orderBy: { createdAt: "asc" },
  });
  const totalsByDay = new Map<string, number>();
  const totalsByMethod = new Map<string, number>();
  for (const sale of sales) {
    const day = sale.createdAt.toISOString().slice(0, 10);
    totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + Number(sale.total));
    for (const payment of sale.payments) totalsByMethod.set(payment.method, (totalsByMethod.get(payment.method) ?? 0) + Number(payment.amount));
  }
  res.json({
    from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
    total: sales.reduce((sum, sale) => sum + Number(sale.total), 0), count: sales.length,
    average: sales.length ? sales.reduce((sum, sale) => sum + Number(sale.total), 0) / sales.length : 0,
    byDay: Array.from(totalsByDay, ([date, total]) => ({ date, total })),
    byMethod: Array.from(totalsByMethod, ([method, total]) => ({ method, total })),
  });
}));

reportsRouter.get("/top-products", requireRole("OWNER", "MANAGER"), asyncHandler(async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const branchId = (req.query.branchId as string) ?? req.auth!.branchId ?? undefined;
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : new Date(new Date().setDate(new Date().getDate() - 29));
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : new Date();
  const items = await prisma.saleItem.findMany({
    where: { sale: { organizationId, branchId, status: "COMPLETED", createdAt: { gte: from, lte: to } } },
    select: { quantity: true, lineTotal: true, variant: { select: { product: { select: { id: true, name: true } } } } },
  });
  const rows = new Map<string, { productId: string; name: string; units: number; revenue: number }>();
  for (const item of items) {
    const product = item.variant.product;
    const row = rows.get(product.id) ?? { productId: product.id, name: product.name, units: 0, revenue: 0 };
    row.units += item.quantity; row.revenue += Number(item.lineTotal); rows.set(product.id, row);
  }
  res.json({ products: Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 20) });
}));

// GET /api/reports/dashboard?branchId= — today's sales total, product count, low stock count
reportsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const branchId = branchForRequest(req, req.query.branchId as string | undefined) ?? req.auth!.branchId ?? undefined;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);
    const [todaySales, productCount, lowStockCount, weeklySales, recentSales, productPerformance, lowStockProducts] = await Promise.all([
      prisma.sale.aggregate({
        where: { organizationId, branchId, status: "COMPLETED", createdAt: { gte: startOfDay } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.product.count({ where: { organizationId, isArchived: false } }),
      branchId
        ? prisma.inventory.count({
            where: { branchId, quantity: { lte: 5 }, variant: { product: { organizationId, isArchived: false } } },
        })
        : Promise.resolve(0),
      prisma.$queryRaw<Array<{ date: Date; revenue: number; transactions: number }>>`
        SELECT date_trunc('day', "createdAt") AS date,
               COALESCE(SUM(total), 0)::float8 AS revenue,
               COUNT(*)::int AS transactions
        FROM sales
        WHERE "organizationId" = ${organizationId}
          AND status = 'COMPLETED'
          AND "createdAt" >= ${weekStart}
          ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        GROUP BY date_trunc('day', "createdAt")
        ORDER BY date ASC
      `,
      prisma.sale.findMany({
        where: { organizationId, branchId, status: "COMPLETED" },
        orderBy: { createdAt: "desc" }, take: 6,
        select: { id: true, total: true, createdAt: true, user: { select: { name: true } }, payments: { where: { status: "SUCCESS" }, select: { method: true } } },
      }),
      prisma.$queryRaw<Array<{ id: string; name: string; imageUrl: string | null; units: number; revenue: number }>>`
        SELECT p.id, p.name, p."imageUrl",
               SUM(si.quantity)::int AS units,
               COALESCE(SUM(si."lineTotal"), 0)::float8 AS revenue
        FROM sale_items si
        JOIN sales s ON s.id = si."saleId"
        JOIN product_variants v ON v.id = si."variantId"
        JOIN products p ON p.id = v."productId"
        WHERE s."organizationId" = ${organizationId}
          AND s.status = 'COMPLETED'
          AND s."createdAt" >= ${weekStart}
          AND p."isArchived" = false
          ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        GROUP BY p.id, p.name, p."imageUrl"
        ORDER BY revenue DESC
        LIMIT 5
      `,
      branchId ? prisma.inventory.findMany({
        where: { branchId, quantity: { lte: 5 }, variant: { product: { organizationId, isArchived: false } } },
        orderBy: { quantity: "asc" }, take: 5,
        select: { quantity: true, variant: { select: { size: true, color: true, product: { select: { name: true, imageUrl: true } } } } },
      }) : Promise.resolve([]),
    ]);

    res.json({
      todaySalesTotal: todaySales._sum.total ?? 0,
      todaySalesCount: todaySales._count,
      productCount,
      lowStockCount,
      weeklySales: weeklySales.map((row) => ({ date: row.date.toISOString().slice(0, 10), revenue: Number(row.revenue), transactions: Number(row.transactions) })),
      recentSales: recentSales.map((sale) => ({ id: sale.id, total: Number(sale.total), createdAt: sale.createdAt, employee: sale.user.name, paymentMethod: sale.payments[0]?.method ?? "—" })),
      topProducts: productPerformance.map((product) => ({ ...product, units: Number(product.units), revenue: Number(product.revenue) })),
      lowStockProducts: lowStockProducts.map((item) => ({ name: item.variant.product.name, color: item.variant.color, size: item.variant.size, quantity: item.quantity, imageUrl: item.variant.product.imageUrl })),
    });
  })
);

// GET /api/reports/sales-by-day?branchId=&days=7
reportsRouter.get(
  "/sales-by-day",
  requireRole("OWNER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const branchId = (req.query.branchId as string) ?? req.auth!.branchId ?? undefined;
    const days = Number(req.query.days ?? 7);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sales = await prisma.sale.findMany({
      where: { organizationId, branchId, status: "COMPLETED", createdAt: { gte: since } },
      select: { total: true, createdAt: true },
    });

    const byDay = new Map<string, number>();
    for (const s of sales) {
      const key = s.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(s.total));
    }

    res.json({ data: Array.from(byDay.entries()).map(([date, total]) => ({ date, total })) });
  })
);
