import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const img = (photoId: string) => `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=900&q=80`;

const catalog = [
  {
    name: "Everyday Open-Front Abaya", category: "Abayas", price: 4800,
    image: img("photo-1772474569781-2fb1c6539f8c"), sizes: ["S", "M", "L", "XL", "XXL"], colors: ["Black", "Mocha", "Navy"],
  },
  {
    name: "Embroidered Occasion Abaya", category: "Abayas", price: 9500,
    image: img("photo-1760083545495-b297b1690672"), sizes: ["S", "M", "L", "XL"], colors: ["Black", "Beige"],
  },
  {
    name: "Two-Piece Jilbab Set", category: "Modest Wear", price: 5800,
    image: img("photo-1757899524697-37dddefd8e75"), sizes: ["S", "M", "L", "XL"], colors: ["Black", "Olive", "Navy"],
  },
  {
    name: "Everyday Prayer Dress", category: "Prayer Wear", price: 3200,
    image: img("photo-1564251658801-0fb2bca2e64b"), sizes: ["One Size"], colors: ["Black", "Stone"],
  },
  {
    name: "Printed Blue Kaftan Maxi Dress", category: "Dresses", price: 4200,
    image: img("photo-1753192108606-b4a2bc9e5661"), sizes: ["M", "L", "XL", "XXL"], colors: ["Blue"],
  },
  {
    name: "Modest Maxi Dress", category: "Dresses", price: 3900,
    image: img("photo-1770374474485-cf75b0d3458b"), sizes: ["S", "M", "L", "XL"], colors: ["Black", "Forest Green"],
  },
  {
    name: "Chiffon Hijab", category: "Hijabs & Scarves", price: 700,
    image: img("photo-1564251658801-0fb2bca2e64b"), sizes: ["One Size"], colors: ["Black", "Beige", "Dusty Rose", "Olive"],
  },
  {
    name: "Jersey Hijab", category: "Hijabs & Scarves", price: 650,
    image: img("photo-1770374474485-cf75b0d3458b"), sizes: ["One Size"], colors: ["Black", "Stone", "Navy"],
  },
  {
    name: "Cotton Hijab Undercap", category: "Hijabs & Scarves", price: 350,
    image: img("photo-1564251658801-0fb2bca2e64b"), sizes: ["One Size"], colors: ["Black", "Beige", "White"],
  },
  {
    name: "Comfort Flat Sandals", category: "Shoes", price: 2200,
    image: img("photo-1515965230482-0b9b46fbee14"), sizes: ["37", "38", "39", "40", "41", "42"], colors: ["Tan"],
  },
  {
    name: "Everyday Modest Flats", category: "Shoes", price: 2600,
    image: img("photo-1563357732-94f6a5df8e4a"), sizes: ["37", "38", "39", "40", "41", "42"], colors: ["Black", "Beige"],
  },
  {
    name: "Lightweight Walking Sneakers", category: "Shoes", price: 3800,
    image: img("photo-1637437757614-6491c8e915b5"), sizes: ["37", "38", "39", "40", "41", "42"], colors: ["White"],
  },
  {
    name: "Classic Men's Thobe", category: "Men's Modest Wear", price: 4500,
    image: img("photo-1555015104-679a62a49fad"), sizes: ["S", "M", "L", "XL", "XXL"], colors: ["White", "Charcoal"],
  },
  {
    name: "Kufi Prayer Cap", category: "Prayer Wear", price: 600,
    image: img("photo-1542967139-b45bb326ec87"), sizes: ["M", "L"], colors: ["White", "Black"],
  },
];

async function main() {
  if (process.env.CATALOG_LIST_OWNERS === "1") {
    const owners = await prisma.user.findMany({
      where: { role: "OWNER", isActive: true },
      select: { name: true, email: true, organization: { select: { name: true } } },
      orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    });
    console.log(JSON.stringify(owners.map((owner) => ({ store: owner.organization.name, owner: owner.name, email: owner.email })), null, 2));
    return;
  }

  if (process.env.CATALOG_VERIFY === "1") {
    const ownerEmail = (process.env.CATALOG_OWNER_EMAIL ?? "amina@ashlertrends.test").trim().toLowerCase();
    const owner = await prisma.user.findFirst({
      where: { email: { equals: ownerEmail, mode: "insensitive" }, role: "OWNER", isActive: true },
      select: { organizationId: true },
    });
    if (!owner) throw new Error("Active owner not found for catalog verification.");
    const products = await prisma.product.findMany({
      where: { organizationId: owner.organizationId, name: { in: catalog.map((item) => item.name) } },
      select: { name: true, imageUrl: true, variants: { select: { inventory: { select: { quantity: true } } } } },
      orderBy: { name: "asc" },
    });
    console.log(JSON.stringify(products.map((product) => ({
      name: product.name,
      variants: product.variants.length,
      stock: product.variants.reduce((total, variant) => total + variant.inventory.reduce((sum, row) => sum + row.quantity, 0), 0),
      hasPhoto: Boolean(product.imageUrl),
    })), null, 2));
    return;
  }

  const ownerEmail = (process.env.CATALOG_OWNER_EMAIL ?? process.argv[2])?.trim().toLowerCase();
  if (!ownerEmail) throw new Error("Pass the new store owner's login email as an argument.");

  const owners = await prisma.user.findMany({
    where: { email: { equals: ownerEmail, mode: "insensitive" }, role: "OWNER", isActive: true },
    include: { organization: true },
  });
  if (owners.length !== 1) throw new Error(`Expected exactly one active owner account for ${ownerEmail}; found ${owners.length}. No catalog changes made.`);

  const owner = owners[0];
  const branch = await prisma.branch.findFirst({ where: { organizationId: owner.organizationId, isMain: true } });
  if (!branch) throw new Error("The selected store has no main branch. No catalog changes made.");

  const categoryIds = new Map<string, string>();
  for (const name of [...new Set(catalog.map((item) => item.category))]) {
    const category = await prisma.category.upsert({
      where: { organizationId_name: { organizationId: owner.organizationId, name } },
      update: {},
      create: { organizationId: owner.organizationId, name },
    });
    categoryIds.set(name, category.id);
  }

  let created = 0;
  let skipped = 0;
  let photosAdded = 0;
  for (const item of catalog) {
    const existing = await prisma.product.findFirst({
      where: { organizationId: owner.organizationId, name: { equals: item.name, mode: "insensitive" } },
      select: { id: true, imageUrl: true },
    });
    if (existing) {
      if (!existing.imageUrl) {
        await prisma.product.update({ where: { id: existing.id }, data: { imageUrl: item.image } });
        photosAdded++;
      }
      skipped++;
      continue;
    }

    await prisma.product.create({
      data: {
        organizationId: owner.organizationId,
        categoryId: categoryIds.get(item.category),
        name: item.name,
        description: "Illustrative stock photo; replace with a photo of your exact item before selling.",
        basePrice: item.price,
        imageUrl: item.image,
        hasVariants: true,
        variants: {
          create: item.sizes.flatMap((size) => item.colors.map((color) => ({
            size,
            color,
            inventory: { create: { branchId: branch.id, quantity: 0 } },
          }))),
        },
      },
    });
    created++;
  }

  console.log(`Catalog complete for ${owner.organization.name}: created ${created}, skipped ${skipped} existing products, added ${photosAdded} missing photos. All new variant stock is 0.`);
  console.log("Review the suggested KSh prices and replace the placeholder photos with photos of your actual items before selling.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
