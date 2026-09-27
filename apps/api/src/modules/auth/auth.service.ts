import argon2 from "argon2";
import { prisma } from "../../lib/prisma";
import { conflict, unauthorized } from "../../utils/errors";
import { newSessionId, sessionExpiry } from "../../utils/session";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// Creates a brand-new tenant (Organization) plus its first OWNER user and a
// default "Main Branch". This is the SaaS sign-up flow.
export async function registerOrganization(input: {
  organizationName: string;
  ownerName: string;
  email: string;
  password: string;
}) {
  const passwordHash = await argon2.hash(input.password);

  const org = await prisma.organization.create({
    data: {
      name: input.organizationName,
      slug: slugify(input.organizationName),
      subscriptionPlan: "TRIAL",
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // 14-day trial
      branches: {
        create: { name: "Main Branch", isMain: true },
      },
    },
    include: { branches: true },
  });

  const mainBranch = org.branches[0];

  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      branchId: mainBranch.id,
      name: input.ownerName,
      email: input.email.toLowerCase(),
      passwordHash,
      role: "OWNER",
    },
  });

  return { org, user };
}

export async function inviteUser(
  organizationId: string,
  input: { name: string; email: string; password: string; role: "MANAGER" | "EMPLOYEE"; branchId?: string }
) {
  const existing = await prisma.user.findUnique({
    where: { organizationId_email: { organizationId, email: input.email.toLowerCase() } },
  });
  if (existing) throw conflict("A user with this email already exists in your organization");

  const passwordHash = await argon2.hash(input.password);
  return prisma.user.create({
    data: {
      organizationId,
      branchId: input.branchId,
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
    },
  });
}

export async function login(identifier: string, password: string) {
  const loginName = identifier.trim();
  const matches = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { email: loginName.toLowerCase() },
        { name: { equals: loginName, mode: "insensitive" } },
      ],
    },
  });
  const validMatches = [];
  for (const candidate of matches) {
    if (await argon2.verify(candidate.passwordHash, password)) validMatches.push(candidate);
  }
  if (validMatches.length !== 1) {
    if (validMatches.length > 1) throw unauthorized("These credentials match more than one store. Ask an owner to use a unique password.");
    throw unauthorized("Invalid email or password");
  }
  const user = validMatches[0];

  const session = await prisma.session.create({
    data: { id: newSessionId(), userId: user.id, expiresAt: sessionExpiry() },
  });

  return { user, sessionId: session.id };
}

export async function logout(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export function publicUser(user: {
  id: string; name: string; email: string; role: string; organizationId: string; branchId: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    branchId: user.branchId,
  };
}
