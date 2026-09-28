import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const demoAccountPassword = process.env.DEMO_ACCOUNT_PASSWORD ?? "password123";
  if (demoAccountPassword.length < 8) {
    throw new Error("DEMO_ACCOUNT_PASSWORD must be at least 8 characters long.");
  }

  const existingDemoOrg = await prisma.organization.findUnique({ where: { slug: "ashler-trends" } });
  if (existingDemoOrg) {
    if (!process.env.DEMO_ACCOUNT_PASSWORD) {
      await prisma.user.updateMany({
        where: { organizationId: existingDemoOrg.id, email: "sales@ashlertrends.test" },
        data: { name: "Desmond" },
      });
      console.log("Ashler Trends already exists; updated the demo staff name to Desmond.");
      return;
    }

    const branch = await prisma.branch.findFirst({
      where: { organizationId: existingDemoOrg.id, isMain: true },
    });
    const passwordHash = await argon2.hash(demoAccountPassword);
    for (const account of [
      { name: "Amina", email: "amina@ashlertrends.test", role: "OWNER" as const },
      { name: "Desmond", email: "sales@ashlertrends.test", role: "EMPLOYEE" as const },
    ]) {
      await prisma.user.upsert({
        where: { organizationId_email: { organizationId: existingDemoOrg.id, email: account.email } },
        update: { name: account.name, passwordHash, isActive: true },
        create: {
          organizationId: existingDemoOrg.id,
          branchId: branch?.id,
          name: account.name,
          email: account.email,
          passwordHash,
          role: account.role,
        },
      });
    }
    console.log("Ashler Trends demo accounts reactivated and updated with the supplied password.");
    return;
  }
  const org = await prisma.organization.create({
    data: {
      name: "Ashler Trends",
      slug: "ashler-trends",
      subscriptionPlan: "TRIAL",
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      branches: { create: { name: "Main Branch", isMain: true } },
    },
    include: { branches: true },
  });
  const branch = org.branches[0];
  const passwordHash = await argon2.hash(demoAccountPassword);

  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: "Amina",
      email: "amina@ashlertrends.test",
      passwordHash,
      role: "OWNER",
    },
  });

  // Ashler Trends has one shop-floor worker who handles sales day to day.
  const employee = await prisma.user.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: "Desmond",
      email: "sales@ashlertrends.test",
      passwordHash,
      role: "EMPLOYEE",
    },
  });

  const categories = {
    abayas: await prisma.category.create({ data: { organizationId: org.id, name: "Abayas" } }),
    hijabs: await prisma.category.create({ data: { organizationId: org.id, name: "Hijabs & Scarves" } }),
    dresses: await prisma.category.create({ data: { organizationId: org.id, name: "Dresses" } }),
    bags: await prisma.category.create({ data: { organizationId: org.id, name: "Bags & Clutches" } }),
  };

  async function seedProduct(opts: {
    categoryId: string;
    name: string;
    description?: string;
    basePrice: number;
    colors: { color: string; stock: number }[];
  }) {
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: opts.categoryId,
        name: opts.name,
        description: opts.description,
        basePrice: opts.basePrice,
        hasVariants: true,
      },
    });

    for (const c of opts.colors) {
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, color: c.color },
      });
      await prisma.inventory.create({ data: { branchId: branch.id, variantId: variant.id, quantity: c.stock } });
      await prisma.stockMovement.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          variantId: variant.id,
          userId: owner.id,
          reason: "RESTOCK",
          quantityBefore: 0,
          quantityChange: c.stock,
          quantityAfter: c.stock,
          note: "Seed data",
        },
      });
    }
  }

  await seedProduct({
    categoryId: categories.abayas.id,
    name: "Open Abaya",
    description: "Everyday open-front abaya",
    basePrice: 4800,
    colors: [
      { color: "Black", stock: 6 },
      { color: "Grey", stock: 5 },
      { color: "Bottle Green", stock: 4 },
      { color: "Navy", stock: 3 },
      { color: "Beige", stock: 5 },
    ],
  });

  await seedProduct({
    categoryId: categories.abayas.id,
    name: "Pearl-Trim Abaya",
    basePrice: 6200,
    colors: [
      { color: "Black", stock: 5 },
      { color: "Navy", stock: 3 },
    ],
  });

  await seedProduct({
    categoryId: categories.abayas.id,
    name: "Embellished Occasion Abaya",
    basePrice: 9500,
    colors: [
      { color: "Black / Beaded", stock: 4 },
      { color: "Black / Sequin", stock: 2 },
    ],
  });

  await seedProduct({
    categoryId: categories.hijabs.id,
    name: "Chiffon Hijab",
    basePrice: 700,
    colors: [
      { color: "Sage", stock: 10 },
      { color: "Forest", stock: 8 },
      { color: "Mustard", stock: 12 },
      { color: "Blush", stock: 14 },
      { color: "Taupe", stock: 10 },
      { color: "Grey-Lilac", stock: 9 },
    ],
  });

  await seedProduct({
    categoryId: categories.hijabs.id,
    name: "Jewel-Tone Hijab",
    basePrice: 750,
    colors: [
      { color: "Plum", stock: 8 },
      { color: "Fuchsia", stock: 6 },
      { color: "Teal", stock: 7 },
      { color: "Sky Blue", stock: 9 },
    ],
  });

  await seedProduct({
    categoryId: categories.dresses.id,
    name: "Satin Kaftan Dress",
    basePrice: 3800,
    colors: [
      { color: "Mustard", stock: 2 },
      { color: "Rust", stock: 2 },
      { color: "Blush", stock: 2 },
      { color: "Burgundy", stock: 2 },
      { color: "White", stock: 2 },
      { color: "Cobalt", stock: 2 },
      { color: "Olive", stock: 1 },
      { color: "Metallic Gold", stock: 1 },
    ],
  });

  await seedProduct({
    categoryId: categories.bags.id,
    name: "Quilted Mini Handbag",
    basePrice: 5200,
    colors: [
      { color: "Cream", stock: 1 },
      { color: "Yellow", stock: 1 },
      { color: "Pink", stock: 1 },
    ],
  });

  await seedProduct({
    categoryId: categories.bags.id,
    name: "Crystal Clutch",
    basePrice: 3400,
    colors: [
      { color: "Purple", stock: 1 },
      { color: "Green", stock: 1 },
      { color: "Pink", stock: 1 },
      { color: "Blue", stock: 1 },
    ],
  });

  await seedProduct({
    categoryId: categories.bags.id,
    name: "Structured Tote",
    basePrice: 6800,
    colors: [
      { color: "Black", stock: 2 },
      { color: "Brown", stock: 2 },
      { color: "Tan", stock: 1 },
    ],
  });

  console.log("Seeded:", { org: org.slug, ownerEmail: owner.email, employeeEmail: employee.email });
  console.log("Both passwords: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
