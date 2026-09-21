import bcrypt from 'bcryptjs';
import prisma from '../prisma';

async function main() {
  console.log('🌱 Seeding TOJ database with realistic creators, sounds, hashtags, and reels...');

  // Clean existing data
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.savedReel.deleteMany();
  await prisma.reelHashtag.deleteMany();
  await prisma.reel.deleteMany();
  await prisma.sound.deleteMany();
  await prisma.hashtag.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.user.deleteMany();

  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create Creators
  const creatorsData = [
    {
      username: 'neha_dance',
      displayName: 'Neha Verma ✨',
      email: 'neha@toj.app',
      phone: '+919876543210',
      bio: 'Dancer & Choreographer 💃 | Living life in 8-counts | Mumbai 🇮🇳',
      profilePicUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80',
      isVerified: true,
      category: 'creator',
    },
    {
      username: 'rohit_fitness',
      displayName: 'Rohit FitLife 💪',
      email: 'rohit@toj.app',
      phone: '+919876543211',
      bio: 'Daily workout motivation 🔥 | Transform your mind & body | Coach',
      profilePicUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
      isVerified: true,
      category: 'creator',
    },
    {
      username: 'priya_travels',
      displayName: 'Priya Sharma ✈️',
      email: 'priya@toj.app',
      phone: '+919876543212',
      bio: 'Exploring hidden gems of India & the world 🏔️🏖️ | Travel & Food',
      profilePicUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      isVerified: false,
      category: 'creator',
    },
    {
      username: 'sam_comedy',
      displayName: 'Samir FunnyVids 😂',
      email: 'sam@toj.app',
      phone: '+919876543213',
      bio: 'Your daily dose of desi comedy & relatable sketches 🎭',
      profilePicUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
      isVerified: true,
      category: 'creator',
    },
    {
      username: 'tech_tales',
      displayName: 'Tech Tales 📱⚡',
      email: 'tech@toj.app',
      phone: '+919876543214',
      bio: 'Gadget reviews, secret hacks & AI tools in 30 seconds 🚀',
      profilePicUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80',
      isVerified: false,
      category: 'business',
    },
  ];

  const createdUsers: Record<string, any> = {};

  for (const c of creatorsData) {
    createdUsers[c.username] = await prisma.user.create({
      data: {
        ...c,
        passwordHash: defaultPasswordHash,
      },
    });
  }

  // 2. Create Sounds / Audio Tracks
  const soundsData = [
    {
      title: 'Desi Dholak Pop Beats',
      artist: 'DJ Rhythm',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      usageCount: 1420,
    },
    {
      title: 'Trending Hook 2026',
      artist: 'Viral Wave Studio',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      usageCount: 890,
    },
    {
      title: 'Sunset Lofi Chill Vibes',
      artist: 'Acoustic Soul',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      usageCount: 654,
    },
    {
      title: 'Hardcore Gym Bass Drop',
      artist: 'Iron Beats',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      usageCount: 420,
    },
  ];

  const createdSounds: any[] = [];
  for (const s of soundsData) {
    createdSounds.push(await prisma.sound.create({ data: s }));
  }

  // 3. Create Hashtags
  const hashtagsList = ['dance', 'fitness', 'travel', 'comedy', 'tech', 'trending', 'reels', 'viral', 'india'];
  const createdHashtags: Record<string, any> = {};
  for (const tag of hashtagsList) {
    createdHashtags[tag] = await prisma.hashtag.create({
      data: { tag, usageCount: Math.floor(Math.random() * 500 + 50) },
    });
  }

  // 4. Create High-Quality Short Vertical Reels
  // Reliable sample public domain & open CDN vertical video streams
  const reelsData = [
    {
      username: 'neha_dance',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-woman-dancing-in-front-of-a-mirror-42868-large.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1547153760-18fc86324498?w=600&auto=format&fit=crop&q=80',
      caption: 'Felt the rhythm today! How did I do? Drop your ratings below 💃✨ #dance #trending #reels',
      soundId: createdSounds[0].id,
      tags: ['dance', 'trending', 'reels'],
      viewCount: 12450,
      likeCount: 3820,
      commentCount: 142,
      shareCount: 210,
    },
    {
      username: 'rohit_fitness',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-exercising-in-a-crossfit-gym-42851-large.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
      caption: 'No excuses on a Monday! 5 brutal core exercises you must try today 🔥 #fitness #gym #viral',
      soundId: createdSounds[3].id,
      tags: ['fitness', 'viral', 'reels'],
      viewCount: 8940,
      likeCount: 2190,
      commentCount: 88,
      shareCount: 140,
    },
    {
      username: 'priya_travels',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-winding-mountain-road-42847-large.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&auto=format&fit=crop&q=80',
      caption: 'Waking up above the clouds in Himachal 🏔️ Who wants to travel here with me? ✈️ #travel #india #trending',
      soundId: createdSounds[2].id,
      tags: ['travel', 'india', 'trending'],
      viewCount: 15300,
      likeCount: 4910,
      commentCount: 230,
      shareCount: 520,
    },
    {
      username: 'sam_comedy',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-laughing-while-looking-at-his-smartphone-42861-large.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=600&auto=format&fit=crop&q=80',
      caption: 'When your mom catches you scrolling reels at 3 AM 😂 Tag that friend! #comedy #relatable #viral',
      soundId: createdSounds[1].id,
      tags: ['comedy', 'viral', 'reels'],
      viewCount: 24100,
      likeCount: 8740,
      commentCount: 460,
      shareCount: 1100,
    },
    {
      username: 'tech_tales',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-holding-a-smartphone-with-a-green-screen-42849-large.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
      caption: '3 secret Android settings you should turn on right now! 📱⚡ #tech #viral #trending',
      soundId: createdSounds[2].id,
      tags: ['tech', 'viral', 'trending'],
      viewCount: 9780,
      likeCount: 3120,
      commentCount: 95,
      shareCount: 340,
    },
  ];

  for (const r of reelsData) {
    const creator = createdUsers[r.username];
    const createdReel = await prisma.reel.create({
      data: {
        userId: creator.id,
        videoUrl: r.videoUrl,
        thumbnailUrl: r.thumbnailUrl,
        caption: r.caption,
        soundId: r.soundId,
        viewCount: r.viewCount,
        likeCount: r.likeCount,
        commentCount: r.commentCount,
        shareCount: r.shareCount,
        durationMs: 15000,
        privacy: 'public',
        status: 'live',
      },
    });

    for (const tag of r.tags) {
      const hashtag = createdHashtags[tag];
      if (hashtag) {
        await prisma.reelHashtag.create({
          data: { reelId: createdReel.id, hashtagId: hashtag.id },
        });
      }
    }

    // Add some sample comments
    const comment1 = await prisma.comment.create({
      data: {
        reelId: createdReel.id,
        userId: createdUsers['neha_dance'].id,
        text: 'This is absolutely amazing! 🔥 Keep it up!',
      },
    });

    await prisma.comment.create({
      data: {
        reelId: createdReel.id,
        userId: createdUsers['rohit_fitness'].id,
        parentCommentId: comment1.id,
        text: 'Totally agree with you! 💯',
      },
    });
  }

  // 5. Follow relationships (Neha Verma follows Rohit & Priya; Rohit follows Neha Verma back)
  await prisma.follow.create({
    data: {
      followerId: createdUsers['neha_dance'].id,
      followingId: createdUsers['rohit_fitness'].id,
      status: 'accepted',
    },
  });

  await prisma.follow.create({
    data: {
      followerId: createdUsers['rohit_fitness'].id,
      followingId: createdUsers['neha_dance'].id,
      status: 'accepted',
    },
  });

  await prisma.follow.create({
    data: {
      followerId: createdUsers['priya_travels'].id,
      followingId: createdUsers['neha_dance'].id,
      status: 'accepted',
    },
  });

  // 6. Create Notification for follow-back
  await prisma.notification.create({
    data: {
      recipientId: createdUsers['neha_dance'].id,
      actorId: createdUsers['sam_comedy'].id,
      type: 'follow_back_suggestion',
    },
  });

  console.log('✅ Seed completed successfully! Created:');
  console.log(`- ${creatorsData.length} Users/Creators`);
  console.log(`- ${soundsData.length} Sounds`);
  console.log(`- ${hashtagsList.length} Hashtags`);
  console.log(`- ${reelsData.length} Reels with threaded comments`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
