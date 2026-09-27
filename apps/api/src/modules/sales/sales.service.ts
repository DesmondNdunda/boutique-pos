import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { applyStockChange } from "../inventory/inventory.service";
import * as Mpesa from "../payments/mpesa.service";

// CASH and CARD are settled instantly (cash changes hands / card terminal
// confirms at point of sale) so stock is deducted and the sale is marked
// COMPLETED in the same transaction. M-PESA is asynchronous — the customer
// confirms on their phone — so the Sale stays PENDING_PAYMENT and stock is
// only deducted once Safaricom's callback confirms success
// (see confirmMpesaPayment below). This is why "pending" sales exist at all.
export async function checkout(
  organizationId: string,
  branchId: string,
  userId: string,
  input: {
    items: { variantId: string; quantity: number }[];
    paymentMethod: "CASH" | "MPESA" | "CARD";
    phoneNumber?: string;
  }
) {
  if (input.paymentMethod === "MPESA" && !input.phoneNumber) {
    throw badRequest("Phone number is required for M-Pesa payments");
  }

  // Price + validate every line against current catalog/inventory.
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) } },
    include: { product: true, inventory: { where: { branchId } } },
  });

  let subtotal = 0;
  const lines = input.items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant || variant.product.organizationId !== organizationId) {
      throw notFound(`Variant ${item.variantId} not found`);
    }
    const available = variant.inventory[0]?.quantity ?? 0;
    if (available < item.quantity) {
      const label = [variant.product.name, variant.color, variant.size].filter(Boolean).join(" / ");
      throw badRequest(`Insufficient stock for ${label}: only ${available} available`);
    }
    const unitPrice = Number(variant.price ?? variant.product.basePrice);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    return { variantId: variant.id, quantity: item.quantity, unitPrice, lineTotal };
  });

  const total = subtotal;
  if (input.paymentMethod === "MPESA" && (!Number.isSafeInteger(total) || total < 1)) {
    throw badRequest("M-Pesa checkout total must be a whole KSh amount of at least KSh 1");
  }

  if (input.paymentMethod === "CASH" || input.paymentMethod === "CARD") {
    const sale = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          organizationId,
          branchId,
          userId,
          status: "COMPLETED",
          subtotal,
          total,
          items: { create: lines },
          payments: { create: { method: input.paymentMethod, status: "SUCCESS", amount: total } },
        },
        include: { items: true, payments: true },
      });

      for (const line of lines) {
        await applyStockChange(organizationId, branchId, line.variantId, userId, "SALE", -line.quantity, `Sale ${sale.id}`, tx);
      }

      return sale;
    });
    return sale;
  }

  // M-PESA: create the PENDING sale first, then trigger the STK push.
  const sale = await prisma.sale.create({
    data: {
      organizationId,
      branchId,
      userId,
      status: "PENDING_PAYMENT",
      subtotal,
      total,
      items: { create: lines },
    },
    include: { items: true },
  });

  try {
    const stk = await Mpesa.stkPush({
      phone: input.phoneNumber!,
      amount: total,
      accountReference: sale.id,
      description: "Ashler Trends sale",
    });

    await prisma.payment.create({
      data: {
        saleId: sale.id,
        method: "MPESA",
        status: "PENDING",
        amount: total,
        mpesaCheckoutRequestId: stk.CheckoutRequestID,
        mpesaMerchantRequestId: stk.MerchantRequestID,
        phoneNumber: Mpesa.normalizePhone(input.phoneNumber!),
      },
    });

    return { ...sale, mpesa: stk };
  } catch (err) {
    // STK push failed to even initiate (bad phone, Daraja down, etc.) — cancel
    // the sale so it doesn't sit around as an orphaned PENDING_PAYMENT record.
    await prisma.sale.update({ where: { id: sale.id }, data: { status: "CANCELED" } });
    throw err;
  }
}

// Called by the /payments/mpesa/callback webhook once Safaricom confirms
// (or rejects) the STK push. This is the ONLY place stock is deducted for
// an M-Pesa sale.
export async function confirmMpesaPayment(parsed: ReturnType<typeof Mpesa.parseCallback>) {
  const payment = await prisma.payment.findFirst({
    where: { mpesaCheckoutRequestId: parsed.checkoutRequestId },
    include: { sale: { include: { items: true } } },
  });
  if (!payment) return; // unknown callback — ignore
  if ((parsed.merchantRequestId && parsed.merchantRequestId !== payment.mpesaMerchantRequestId) || (parsed.success && (parsed.amount !== Number(payment.amount) || !parsed.phoneNumber || parsed.phoneNumber !== payment.phoneNumber || !parsed.mpesaReceiptNumber))) {
    throw badRequest("M-Pesa callback details do not match the pending payment");
  }

  await prisma.$transaction(async (tx) => {
    // Callback delivery is at least once. Claim only an open sale so a retry
    // cannot mark the payment twice or decrement inventory a second time.
    const claimed = await tx.sale.updateMany({
      where: { id: payment.saleId, status: "PENDING_PAYMENT" },
      data: { status: parsed.success ? "COMPLETED" : "CANCELED" },
    });
    if (claimed.count === 0) return;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: parsed.success ? "SUCCESS" : "FAILED",
        mpesaReceiptNumber: parsed.success ? parsed.mpesaReceiptNumber : undefined,
        rawCallback: parsed as any,
      },
    });
    if (!parsed.success) return;

    const sale = payment.sale;

    for (const item of payment.sale.items) {
      await applyStockChange(
        sale.organizationId,
        sale.branchId,
        item.variantId,
        sale.userId,
        "SALE",
        -item.quantity,
        `M-Pesa sale ${sale.id}`,
        tx
      );
    }
  });
}

export async function getSale(organizationId: string, saleId: string, branchId?: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId, branchId },
    include: { items: { include: { variant: { include: { product: true } } } }, payments: true, user: true },
  });
  if (!sale) throw notFound("Sale not found");
  return sale;
}

export async function listSales(organizationId: string, opts: { branchId?: string; from?: Date; to?: Date }) {
  return prisma.sale.findMany({
    where: {
      organizationId,
      branchId: opts.branchId,
      createdAt: opts.from || opts.to ? { gte: opts.from, lte: opts.to } : undefined,
    },
    include: { items: true, payments: true, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
