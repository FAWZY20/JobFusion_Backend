/**
 * SCRAPER HELLOWORK - VERSION SERVEUR NODE.JS
 * 
 * Installation requise :
 * npm install express puppeteer cors
 * 
 * Lancement :
 * node server/helloworkScraper.js
 */

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

/**
 * Scrape HelloWork avec Puppeteer
 */
async function scrapeHelloWorkJobs(query, location = '', maxPages = 3) {
  console.log(`🔍 Recherche HelloWork: "${query}" à "${location}"`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
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
      const start = pageNum * 15; // HelloWork affiche 15 offres par page
      const url = `https://www.hellowork.com/fr-fr/emplois/search?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&offset=${start}`;
      
      console.log(`📄 Page ${pageNum + 1}/${maxPages}: ${url}`);
      
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });

        // Attendre le chargement des résultats
        await page.waitForSelector('article[data-testid="job-card"], div.job-card, article.JobCard', { timeout: 10000 }).catch(() => {
          console.log('⚠️ Aucun résultat trouvé sur cette page');
        });

        // Extraire les données
        const jobs = await page.evaluate(() => {
          // Essayer plusieurs sélecteurs car HelloWork change sa structure
          const jobCards = document.querySelectorAll(
            'article[data-testid="job-card"], div.job-card, article.JobCard, div[data-testid*="job"]'
          );
          const results = [];

          jobCards.forEach(card => {
            try {
              // Essayer plusieurs sélecteurs pour le titre
              const titleEl = card.querySelector(
                'h2, h3, [data-testid*="title"], .job-title, a[href*="/emplois/"]'
              );
              
              // Essayer plusieurs sélecteurs pour l'entreprise
              const companyEl = card.querySelector(
                '[data-testid*="company"], .company-name, .company, span[class*="company"]'
              );
              
              // Localisation
              const locationEl = card.querySelector(
                '[data-testid*="location"], .location, .job-location, span[class*="location"]'
              );
              
              // Salaire
              const salaryEl = card.querySelector(
                '.salary, [class*="salary"], span[class*="salary"]'
              );
              
              // Lien vers l'offre
              const linkEl = card.querySelector('a[href*="/emplois/"]');
              
              // Description/Snippet
              const descEl = card.querySelector(
                '.description, .job-snippet, [class*="snippet"], p'
              );
              
              // Type de contrat
              const typeEl = card.querySelector(
                '[data-testid*="contract"], .contract-type, span[class*="type"]'
              );

              if (titleEl && titleEl.textContent.trim()) {
                results.push({
                  title: titleEl.textContent.trim(),
                  company: companyEl ? companyEl.textContent.trim() : 'Non spécifié',
                  location: locationEl ? locationEl.textContent.trim() : 'Non spécifié',
                  salary: salaryEl ? salaryEl.textContent.trim() : null,
                  description: descEl ? descEl.textContent.trim().substring(0, 200) : '',
                  url: linkEl ? linkEl.getAttribute('href') : '',
                  posted: 'Récent',
                  type: typeEl ? typeEl.textContent.trim() : 'CDI',
                  source: 'HelloWork'
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
      } catch (pageError) {
        console.error(`Erreur sur la page ${pageNum + 1}:`, pageError.message);
        continue;
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors du scraping:', error);
  } finally {
    await browser.close();
  }

  console.log(`🎉 Total: ${allJobs.length} offres HelloWork récupérées`);
  return allJobs;
}

/**
 * API Endpoint pour récupérer les offres HelloWork
 */
app.get('/api/jobs/hellowork', async (req, res) => {
  try {
    const { query = 'emploi', location = 'France', maxPages = 2 } = req.query;
    
    const jobs = await scrapeHelloWorkJobs(query, location, parseInt(maxPages));
    
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
  res.json({ status: 'OK', message: 'HelloWork Scraper API is running' });
});

/**
 * Démarrage du serveur
 */
app.listen(PORT, () => {
  console.log(`🚀 Serveur HelloWork démarré sur http://localhost:${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/api/jobs/hellowork?query=développeur&location=Paris`);
  console.log(`\n⚠️  ATTENTION: Respectez les conditions d'utilisation d'HelloWork\n`);
});

module.exports = { scrapeHelloWorkJobs };
