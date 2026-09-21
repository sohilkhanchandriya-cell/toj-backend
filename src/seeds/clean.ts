import prisma from '../prisma';

async function clean() {
  console.log('🧹 Purging all dummy accounts, dummy reels, and mock data...');

  // Delete all dummy data in cascade-safe order
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.savedReel.deleteMany();
  await prisma.reelHashtag.deleteMany();
  await prisma.reel.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.user.deleteMany();

  console.log('✨ Database is now 100% CLEAN. Only real created accounts and real uploaded reels will exist.');
}

clean()
  .catch((e) => {
    console.error('Error cleaning database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
