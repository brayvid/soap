const axios = require('axios');
const knex = require('../db');
const dayjs = require('dayjs');

const GOVTRACK_PEOPLE_URL = 'https://www.govtrack.us/api/v2/person?role_type=member&current=True&limit=600';


async function fetchPoliticians() {
  try {
    const { data } = await axios.get(GOVTRACK_PEOPLE_URL);
    const allPeople = data.objects;

    console.log(`Total people with current roles: ${allPeople.length}`);

    const politicians = allPeople.map(person => {
      const role = person.current_role;

      // Skip if role data is missing
      if (!role || !person.slug || !person.id) {
        console.warn(`⚠️ Skipping ${person.name} due to missing role or slug/id`);
        return null;
      }

      const profile_url = `https://www.govtrack.us/congress/members/${person.slug}/${person.id}`;

      return {
        name: person.name,
        person_id: person.id,
        bioguide_id: person.bioguideid || null,
        title: role.title,
        chamber: role.title === 'Senator' ? 'Senate' : 'House',
        state: role.state,
        district: role.district?.toString() ?? null,
        party: role.party,
        slug: person.slug,
        profile_url,
        start_date: role.startdate,
        end_date: role.enddate,
        last_updated: dayjs().toISOString(),
      };
    }).filter(Boolean);

    console.log(`🔗 Inserting ${politicians.length} valid politicians...`);
    for (const pol of politicians) {
      await knex('politicians')
        .insert(pol)
        .onConflict('profile_url')
        .merge();
    }

    console.log('✅ Done. Politicians upserted.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fetching or updating:', error.message);
    process.exit(1);
  }
}

fetchPoliticians();
