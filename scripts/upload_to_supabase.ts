import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseServer } from '../server/lib/supabase-server.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Starting Supabase gallery upload and database sync...');

  const imagesToUpload = [
    { file: 'campus_1.jpg', dest: 'szmc/campus_1.jpg' },
    { file: 'campus_2.jpg', dest: 'szmc/campus_2.jpg' },
    { file: 'szmc_day_1.jpg', dest: 'szmc/szmc_day_1.jpg' },
    { file: 'szmc_day_2.jpg', dest: 'szmc/szmc_day_2.jpg' },
    { file: 'szmc_day_3.jpg', dest: 'szmc/szmc_day_3.jpg' },
    { file: 'conference.jpg', dest: 'szmc/conference.jpg' },
    { file: 'beauty_of_szmc.jpg', dest: 'szmc/beauty_of_szmc.jpg' },
    { file: 'sports.jpg', dest: 'szmc/sports.jpg' },
    { file: 'beginnings.jpg', dest: 'szmc/beginnings.jpg' },
  ];

  const uploadedUrls: Record<string, string> = {};

  for (const item of imagesToUpload) {
    const localPath = path.resolve(__dirname, '../public/assets/szmc', item.file);
    try {
      const buffer = await fs.readFile(localPath);
      const { data, error } = await supabaseServer.storage.from('gallery').upload(item.dest, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) {
        console.error(`Failed to upload ${item.file}:`, error);
      } else {
        const { data: pub } = supabaseServer.storage.from('gallery').getPublicUrl(item.dest);
        uploadedUrls[item.file] = pub.publicUrl;
        console.log(`Uploaded ${item.file} -> ${pub.publicUrl}`);
      }
    } catch (err: any) {
      console.error(`Error reading ${item.file}:`, err.message);
    }
  }

  // Next: Seed albums into Supabase `gallery_albums` and `gallery_photos` tables
  const albumsToSeed = [
    {
      title: 'SZMC Medical College Campus & Academic Facilities',
      description: 'Iconic panoramic views of Shaheed Ziaur Rahman Medical College Bogura campus, hospital building, and green courtyards.',
      category: 'campus',
      event_date_label: 'Continuous Archive',
      location: 'SZMC Campus, Silimpur, Bogura',
      cover_url: uploadedUrls['campus_1.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/campus_1.jpg',
      photos_count: 2,
      is_published: true,
      photos: [
        {
          url: uploadedUrls['campus_1.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/campus_1.jpg',
          caption: 'Shaheed Ziaur Rahman Medical College & Hospital main academic building complex under monsoon sky',
          tags: ['Campus', 'Academic Building', 'Silimpur', 'Architecture', 'Photo 1'],
        },
        {
          url: uploadedUrls['campus_2.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/campus_2.jpg',
          caption: 'Main entrance facade with circular drive-in portico and campus palm greenery',
          tags: ['Campus Entrance', 'Courtyard', 'Palms', 'Photo 2'],
        },
      ],
    },
    {
      title: 'SZMC Day Grand Annual Celebration & Alumni Gathering',
      description: 'Annual 5th November SZMC Day celebrations, reunion rallies, student assemblies, and historic commemorative posters.',
      category: 'reunion',
      event_date_label: '5th November Annual',
      location: 'Central Campus Grounds, SZMC',
      cover_url: uploadedUrls['szmc_day_1.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/szmc_day_1.jpg',
      photos_count: 3,
      is_published: true,
      photos: [
        {
          url: uploadedUrls['szmc_day_1.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/szmc_day_1.jpg',
          caption: 'Massive SZMC Day alumni gathering and rally with official 5th November celebration banner',
          tags: ['SZMC Day', '5th November', 'Reunion', 'Alumni Gathering', 'Photo 10, 3, 6'],
        },
        {
          url: uploadedUrls['szmc_day_2.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/szmc_day_2.jpg',
          caption: 'SZMC DAY 2026 November 05 countdown poster: "এসো স্মৃতির প্রাঙ্গণে মিলি প্রীতির বন্ধনে"',
          tags: ['SZMC Day 2026', 'Official Poster', 'Countdown', 'Photo 6'],
        },
        {
          url: uploadedUrls['szmc_day_3.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/szmc_day_3.jpg',
          caption: 'Commemorative "Shikor Theke Shikhore" historic festival artwork featuring Mahasthangarh Stupa',
          tags: ['Shikor Theke Shikhore', 'Heritage', 'Mahasthangarh', 'Poster', 'SZMC Day'],
        },
      ],
    },
    {
      title: 'Clinical & Academic Medical Conferences',
      description: 'Postgraduate medical seminars, clinical case symposiums, and professional CME conventions at the central auditorium.',
      category: 'academic',
      event_date_label: 'Quarterly',
      location: 'SZMC Central Medical Auditorium',
      cover_url: uploadedUrls['conference.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/conference.jpg',
      photos_count: 1,
      is_published: true,
      photos: [
        {
          url: uploadedUrls['conference.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/conference.jpg',
          caption: 'SZMC Medical College Grand Auditorium filled with doctors, faculty, and fellows during clinical seminar',
          tags: ['Conference', 'Auditorium', 'Medical Symposium', 'CME', 'Photo 4'],
        },
      ],
    },
    {
      title: 'Beauty of SZMC: Cultural Festivals & Decorated Walkways',
      description: 'Vibrant festival decor, red-canopied campus walkways, illuminated promenades, and artistic installations.',
      category: 'campus',
      event_date_label: 'Autumn Festivals',
      location: 'Campus Walkways & Plaza',
      cover_url: uploadedUrls['beauty_of_szmc.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/beauty_of_szmc.jpg',
      photos_count: 1,
      is_published: true,
      photos: [
        {
          url: uploadedUrls['beauty_of_szmc.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/beauty_of_szmc.jpg',
          caption: 'Decorated red canopy walkway with red carpet and colorful batch pavilions on campus promenade',
          tags: ['Beauty of SZMC', 'Red Canopy', 'Festive Decor', 'Walkway', 'Photo 5'],
        },
      ],
    },
    {
      title: 'Shaheed Zia Memorial Cricket & Sports Tournament',
      description: 'Inter-batch medical cricket championships, athletic meets, and victory celebrations on the college sports field.',
      category: 'sports',
      event_date_label: 'Annual Sports Season',
      location: 'SZMC Sports Grounds',
      cover_url: uploadedUrls['sports.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/sports.jpg',
      photos_count: 1,
      is_published: true,
      photos: [
        {
          url: uploadedUrls['sports.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/sports.jpg',
          caption: 'Cricket tournament champions celebration holding trophy on the pitch with vibrant colored smoke bomb effects',
          tags: ['Cricket', 'Champions', 'Trophy', 'Sports Day', 'Photos 7, 8'],
        },
      ],
    },
    {
      title: 'Historic Beginnings & 2006 Campus Inauguration Legacy',
      description: 'Historical archive of the 2006 opening ceremony and founding milestones of Shaheed Ziaur Rahman Medical College.',
      category: 'convocation',
      event_date_label: '2006 Inauguration Milestone',
      location: 'SZMC Hospital Complex, Bogura',
      cover_url: uploadedUrls['beginnings.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/beginnings.jpg',
      photos_count: 1,
      is_published: true,
      photos: [
        {
          url: uploadedUrls['beginnings.jpg'] || 'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/beginnings.jpg',
          caption: 'Historic 2006 inauguration ceremony with founding medical college directors and dignitaries in new hospital ward',
          tags: ['Historic', '2006 Inauguration', 'Beginnings', 'Founding Legacy', 'Photo 9'],
        },
      ],
    },
  ];

  for (const album of albumsToSeed) {
    const { photos, ...albumData } = album;
    // Check if album already exists by title
    const { data: existing } = await supabaseServer
      .from('gallery_albums')
      .select('id')
      .eq('title', albumData.title)
      .maybeSingle();

    let albumId: number | bigint;
    if (existing?.id) {
      albumId = existing.id;
      await supabaseServer.from('gallery_albums').update(albumData).eq('id', albumId);
      console.log(`Updated existing album in Supabase: ${albumData.title} (ID: ${albumId})`);
    } else {
      const { data: inserted, error: insErr } = await supabaseServer
        .from('gallery_albums')
        .insert(albumData)
        .select('id')
        .single();
      if (insErr) {
        console.error(`Failed to insert album ${albumData.title}:`, insErr);
        continue;
      }
      albumId = inserted.id;
      console.log(`Inserted new album into Supabase: ${albumData.title} (ID: ${albumId})`);
    }

    // Insert photos
    for (const p of photos) {
      const { data: photoExists } = await supabaseServer
        .from('gallery_photos')
        .select('id')
        .eq('album_id', albumId)
        .eq('url', p.url)
        .maybeSingle();

      if (!photoExists) {
        const { error: pErr } = await supabaseServer.from('gallery_photos').insert({
          album_id: albumId,
          url: p.url,
          caption: p.caption,
          tags: p.tags,
        });
        if (pErr) {
          console.error(`Failed to insert photo for album ${albumId}:`, pErr);
        } else {
          console.log(`Inserted photo for album ${albumId}: ${p.url}`);
        }
      }
    }
  }

  console.log('Finished Supabase gallery sync successfully!');
}

main().catch(console.error);
