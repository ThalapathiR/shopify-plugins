import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany();
  console.log('Total Sessions:', sessions.length);
  sessions.forEach(s => {
    console.log(`Shop: ${s.shop}, Online: ${s.isOnline}, ID: ${s.id}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
