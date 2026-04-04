const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
  try {
    const sessions = await prisma.session.findMany();
    console.log("--- SESSION REPORT ---");
    console.log("Total sessions:", sessions.length);
    sessions.forEach(s => {
      console.log(`ID: ${s.id} | Shop: ${s.shop} | Online: ${s.isOnline} | HasToken: ${!!s.accessToken}`);
    });
    console.log("--- END REPORT ---");
  } catch (e) {
    console.error("Error checking sessions:", e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
