/**
 * SCRAPER INDEED - VERSION SERVEUR NODE.JS
 * 
 * Installation requise :
 * npm install express puppeteer cors
 * 
 * Lancement :
 * node server/indeedScraper.js
 */

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * Scrape Indeed avec Puppeteer
 */
async function scrapeIndeedJobs(query, location = '', maxPages = 3) {
  console.log(`🔍 Recherche: "${query}" à "${location}"`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  // Anti-détection
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });

  const allJobs = [];

  try {
    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      const start = pageNum * 10;
      const url = `https://fr.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&start=${start}`;

      console.log(`📄 Page ${pageNum + 1}/${maxPages}: ${url}`);

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Attendre le chargement des résultats
      await page.waitForSelector('.job_seen_beacon, .jobsearch-ResultsList', { timeout: 10000 }).catch(() => {
        console.log('⚠️ Aucun résultat trouvé sur cette page');
      });

      // Extraire les données
      const jobs = await page.evaluate(() => {
        const jobCards = document.querySelectorAll('.job_seen_beacon');
        const results = [];

        jobCards.forEach(card => {
          try {
            // Sélecteurs mis à jour (Indeed change souvent sa structure)
            const titleEl = card.querySelector('h2.jobTitle span[title], h2.jobTitle a span');
            const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
            const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation');
            const salaryEl = card.querySelector('.salary-snippet, .metadata.salary-snippet-container');
            const linkEl = card.querySelector('a.jcs-JobTitle, h2.jobTitle a');
            const descEl = card.querySelector('.job-snippet, .jobCardShelfContainer');
            const dateEl = card.querySelector('.date, .myJobsStateContainer span');

            if (titleEl && companyEl) {
              results.push({
                title: titleEl.textContent.trim(),
                company: companyEl.textContent.trim(),
                location: locationEl ? locationEl.textContent.trim() : 'Non spécifié',
                salary: salaryEl ? salaryEl.textContent.trim() : null,
                description: descEl ? descEl.textContent.trim().substring(0, 200) + '...' : '',
                url: linkEl ? 'https://fr.indeed.com' + linkEl.getAttribute('href') : '',
                posted: dateEl ? dateEl.textContent.trim() : 'Date inconnue',
                type: 'CDI', // À améliorer avec l'extraction réelle
                source: 'Indeed'
              });
            }
          } catch (err) {
            console.error('Erreur parsing job card:', err);
          }
        });

        return results;
      });

      console.log(`✅ ${jobs.length} offres trouvées sur la page ${pageNum + 1}`);
      allJobs.push(...jobs);

      // Délai entre les pages pour éviter le blocage
      if (pageNum < maxPages - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors du scraping:', error);
  } finally {
    await browser.close();
  }

  console.log(`🎉 Total: ${allJobs.length} offres récupérées`);
  return allJobs;
}

/**
 * API Endpoint pour récupérer les offres
 */
app.get('/api/jobs/indeed', async (req, res) => {
  try {
    const { query = 'développeur', location = 'Paris', maxPages = 2 } = req.query;

    const jobs = await scrapeIndeedJobs(query, location, parseInt(maxPages));

    res.json({
      success: true,
      count: jobs.length,
      jobs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Indeed Scraper API is running' });
});

/**
 * Démarrage du serveur
 */
app.listen(PORT, () => {
  console.log(`🚀 Serveur de scraping démarré sur http://localhost:${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/api/jobs/indeed?query=développeur&location=Paris`);
  console.log(`\n⚠️  ATTENTION: Respectez les conditions d'utilisation d'Indeed`);
  console.log(`💡 Préférez l'API officielle: https://www.indeed.com/publisher\n`);
});

module.exports = { scrapeIndeedJobs };
