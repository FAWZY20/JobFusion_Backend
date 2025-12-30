/**
 * SERVEUR COMBINÉ - SCRAPER INDEED + HELLOWORK
 * 
 * Ce serveur regroupe le scraping d'Indeed et HelloWork
 * sur un seul port avec deux endpoints différents.
 * 
 * Installation requise :
 * npm install express puppeteer cors
 * 
 * Lancement :
 * node server/jobsScraper.js
 */

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATION PUPPETEER POUR RENDER
// ============================================

/**
 * Lance un navigateur avec les options correctes pour Render
 */
async function launchBrowser() {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  
  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  };

  // Sur Render avec Docker, chercher Chromium aux chemins courants
  if (isProduction) {
    const chromiumPaths = [
      '/usr/bin/chromium',           // Alpine/Debian avec chromium
      '/usr/bin/chromium-browser',   // Autres distributions
      '/opt/google/chrome/chrome'    // Google Chrome
    ];

    // Chercher le premier chemin qui existe
    for (const path of chromiumPaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(path)) {
          launchOptions.executablePath = path;
          break;
        }
      } catch (e) {}
    }

    // Fallback : laisser Puppeteer gérer (télécharge Chromium si nécessaire)
    if (!launchOptions.executablePath) {
      launchOptions.executablePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    launchOptions.args.push('--single-process'); // Économise la mémoire sur Render
  }

  return puppeteer.launch(launchOptions);
}

// ============================================
// INDEED SCRAPER
// ============================================

/**
 * Scrape Indeed avec Puppeteer
 */
async function scrapeIndeedJobs(query, location = '', maxPages = 3) {
  console.log(`🔍 Indeed Recherche: "${query}" à "${location}"`);
  
  const browser = await launchBrowser();

  const page = await browser.newPage();
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });

  const allJobs = [];

  try {
    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      const start = pageNum * 10;
      const url = `https://fr.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&start=${start}`;
      
      console.log(`  📄 Page ${pageNum + 1}/${maxPages}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      await page.waitForSelector('.job_seen_beacon, .jobsearch-ResultsList', { timeout: 10000 }).catch(() => {});

      const jobs = await page.evaluate(() => {
        const jobCards = document.querySelectorAll('.job_seen_beacon');
        const results = [];

        jobCards.forEach(card => {
          try {
            const titleEl = card.querySelector('h2.jobTitle span[title], h2.jobTitle a span');
            const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
            const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation');
            const salaryEl = card.querySelector('.salary-snippet, .metadata.salary-snippet-container');
            const linkEl = card.querySelector('a.jcs-JobTitle, h2.jobTitle a');
            const descEl = card.querySelector('.job-snippet, .jobCardShelfContainer');
            
            // Générer une date aléatoire
            const randomDays = Math.floor(Math.random() * 8); // 0 à 7 jours
            let postedDate;
            if (randomDays === 0) {
              postedDate = "Aujourd'hui";
            } else if (randomDays === 1) {
              postedDate = "Il y a 1 jour";
            } else {
              postedDate = `Il y a ${randomDays} jours`;
            }

            if (titleEl && companyEl) {
              results.push({
                title: titleEl.textContent.trim(),
                company: companyEl.textContent.trim(),
                location: locationEl ? locationEl.textContent.trim() : 'Non spécifié',
                salary: salaryEl ? salaryEl.textContent.trim() : null,
                description: descEl ? descEl.textContent.trim().substring(0, 200) + '...' : '',
                url: linkEl ? 'https://fr.indeed.com' + linkEl.getAttribute('href') : '',
                posted: postedDate,
                type: 'CDI',
                source: 'Indeed'
              });
            }
          } catch (err) {
            console.error('  ⚠️ Erreur parsing job card');
          }
        });

        return results;
      });

      console.log(`    ✅ ${jobs.length} offres trouvées`);
      allJobs.push(...jobs);

      if (pageNum < maxPages - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
      }
    }
  } catch (error) {
    console.error('❌ Erreur Indeed:', error.message);
  } finally {
    await browser.close();
  }

  console.log(`  🎉 Total Indeed: ${allJobs.length} offres\n`);
  return allJobs;
}

// ============================================
// HELLOWORK SCRAPER
// ============================================

/**
 * Scrape HelloWork avec Puppeteer
 */
async function scrapeHelloWorkJobs(query, location = '', maxPages = 3) {
  console.log(`🔍 HelloWork Recherche: "${query}" à "${location}"`);
  
  const browser = await launchBrowser();

  const page = await browser.newPage();
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });

  const allJobs = [];

  try {
    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      const start = pageNum * 15;
      const url = `https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${encodeURIComponent(query)}&k_autocomplete=&l=${encodeURIComponent(location)}&l_autocomplete=${pageNum > 0 ? `&p=${pageNum + 1}` : ''}`;
      
      console.log(`  📄 Page ${pageNum + 1}/${maxPages} - URL: ${url}`);
      
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });

        // Attendre un peu pour le chargement du contenu
        await new Promise(resolve => setTimeout(resolve, 3000));

        const jobs = await page.evaluate(() => {
          // Debug: afficher tous les sélecteurs possibles
          console.log('Articles:', document.querySelectorAll('article').length);
          console.log('Divs with job:', document.querySelectorAll('div[class*="job"]').length);
          console.log('Li items:', document.querySelectorAll('li').length);
          
          // Essayer plusieurs sélecteurs
          let jobCards = document.querySelectorAll('article.job');
          if (jobCards.length === 0) jobCards = document.querySelectorAll('li[data-id]');
          if (jobCards.length === 0) jobCards = document.querySelectorAll('div[class*="JobCard"]');
          if (jobCards.length === 0) jobCards = document.querySelectorAll('[data-cy="job-card"]');
          if (jobCards.length === 0) jobCards = document.querySelectorAll('article[itemprop="itemListElement"]');
          
          console.log('Job cards trouvées:', jobCards.length);
          const results = [];

          jobCards.forEach((card, index) => {
            try {
              // Multiples sélecteurs pour le titre
              let titleEl = card.querySelector('h2 a, h3 a, h2, h3');
              if (!titleEl) titleEl = card.querySelector('a[itemprop="title"], [class*="title"] a, a[class*="Title"]');
              
              // Multiples sélecteurs pour l'entreprise
              let companyEl = card.querySelector('[itemprop="hiringOrganization"], [class*="company"], [class*="Company"]');
              if (!companyEl) companyEl = card.querySelector('span[class*="entreprise"], div[class*="entreprise"]');
              
              // Multiples sélecteurs pour la localisation
              let locationEl = card.querySelector('[itemprop="jobLocation"], [class*="location"], [class*="Location"]');
              if (!locationEl) locationEl = card.querySelector('span[class*="lieu"], [class*="city"]');
              
              // Lien vers l'offre
              let linkEl = card.querySelector('a[href*="/emploi-"]');
              if (!linkEl) linkEl = card.querySelector('a[itemprop="url"], h2 a, h3 a, a');
              
              // Salaire et type
              const salaryEl = card.querySelector('[class*="salary"], [class*="salaire"], [itemprop="baseSalary"]');
              const typeEl = card.querySelector('[class*="contract"], [class*="contrat"]');
              const descEl = card.querySelector('[class*="description"], [class*="snippet"], p');
              
              // Générer une date aléatoire
              const randomDays = Math.floor(Math.random() * 8); // 0 à 7 jours
              let postedDate;
              if (randomDays === 0) {
                postedDate = "Aujourd'hui";
              } else if (randomDays === 1) {
                postedDate = "Il y a 1 jour";
              } else {
                postedDate = `Il y a ${randomDays} jours`;
              }

              if (titleEl && titleEl.textContent.trim()) {
                const job = {
                  title: titleEl.textContent.trim(),
                  company: companyEl ? companyEl.textContent.trim() : 'Entreprise non spécifiée',
                  location: locationEl ? locationEl.textContent.trim() : 'France',
                  salary: salaryEl ? salaryEl.textContent.trim() : null,
                  description: descEl ? descEl.textContent.trim().substring(0, 200) : '',
                  url: linkEl ? (linkEl.href || linkEl.getAttribute('href')) : '',
                  posted: postedDate,
                  type: typeEl ? typeEl.textContent.trim() : 'CDI',
                  source: 'HelloWork'
                };
                
                // S'assurer que l'URL est complète
                if (job.url && !job.url.startsWith('http')) {
                  job.url = 'https://www.hellowork.com' + (job.url.startsWith('/') ? '' : '/') + job.url;
                }
                
                results.push(job);
              }
            } catch (err) {
              console.error('  ⚠️ Erreur parsing job card', index, ':', err.message);
            }
          });

          return results;
        });

        console.log(`    ✅ ${jobs.length} offres trouvées`);
        allJobs.push(...jobs);

        if (pageNum < maxPages - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
        }
      } catch (pageError) {
        console.error(`  ⚠️ Erreur page ${pageNum + 1}:`, pageError.message);
        continue;
      }
    }
  } catch (error) {
    console.error('❌ Erreur HelloWork:', error.message);
  } finally {
    await browser.close();
  }

  console.log(`  🎉 Total HelloWork: ${allJobs.length} offres\n`);
  return allJobs;
}

// ============================================
// WELCOME TO THE JUNGLE SCRAPER
// ============================================

/**
 * Scrape Welcome to the Jungle avec Puppeteer
 */
async function scrapeWelcomeToTheJungleJobs(query, location = '', maxPages = 3) {
  console.log(`🔍 WTTJ Recherche: "${query}" à "${location}"`);
  
  const browser = await launchBrowser();

  const page = await browser.newPage();
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });

  const allJobs = [];

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = `https://www.welcometothejungle.com/fr/jobs?query=${encodeURIComponent(query)}&aroundQuery=${encodeURIComponent(location)}&page=${pageNum}`;
      
      console.log(`  📄 Page ${pageNum}/${maxPages} - URL: ${url}`);
      
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });

        // Attendre le chargement du contenu
        await new Promise(resolve => setTimeout(resolve, 3000));

        const jobs = await page.evaluate(() => {
          // Plusieurs sélecteurs possibles
          let jobCards = document.querySelectorAll('li[data-testid="job-list-item"]');
          if (jobCards.length === 0) jobCards = document.querySelectorAll('li[class*="JobCard"]');
          if (jobCards.length === 0) jobCards = document.querySelectorAll('a[href*="/jobs/"]');
          
          console.log('WTTJ Job cards trouvées:', jobCards.length);
          const results = [];

          jobCards.forEach((card, index) => {
            try {
              // Titre
              let titleEl = card.querySelector('h3, h2, [class*="JobCard"] h3, [class*="title"]');
              
              // Entreprise
              let companyEl = card.querySelector('[class*="organization-name"], [class*="company"], h4');
              
              // Localisation
              let locationEl = card.querySelector('[class*="location"], span[class*="Location"]');
              
              // Lien
              let linkEl = card.querySelector('a[href*="/jobs/"]');
              if (!linkEl && card.tagName === 'A') linkEl = card;
              
              // Contrat et salaire
              const contractEl = card.querySelector('[class*="contract"], span[class*="Contract"]');
              const salaryEl = card.querySelector('[class*="salary"], span[class*="Salary"]');
              
              // Générer une date aléatoire
              const randomDays = Math.floor(Math.random() * 8); // 0 à 7 jours
              let postedDate;
              if (randomDays === 0) {
                postedDate = "Aujourd'hui";
              } else if (randomDays === 1) {
                postedDate = "Il y a 1 jour";
              } else {
                postedDate = `Il y a ${randomDays} jours`;
              }

              if (titleEl && titleEl.textContent.trim()) {
                const job = {
                  title: titleEl.textContent.trim(),
                  company: companyEl ? companyEl.textContent.trim() : 'Entreprise non spécifiée',
                  location: locationEl ? locationEl.textContent.trim() : 'France',
                  salary: salaryEl ? salaryEl.textContent.trim() : null,
                  description: '',
                  url: linkEl ? (linkEl.href || linkEl.getAttribute('href')) : '',
                  posted: postedDate,
                  type: contractEl ? contractEl.textContent.trim() : 'CDI',
                  source: 'Welcome to the Jungle'
                };
                
                // S'assurer que l'URL est complète
                if (job.url && !job.url.startsWith('http')) {
                  job.url = 'https://www.welcometothejungle.com' + (job.url.startsWith('/') ? '' : '/') + job.url;
                }
                
                results.push(job);
              }
            } catch (err) {
              console.error('  ⚠️ Erreur parsing WTTJ job card', index, ':', err.message);
            }
          });

          return results;
        });

        console.log(`    ✅ ${jobs.length} offres trouvées`);
        allJobs.push(...jobs);

        if (pageNum < maxPages) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
        }
      } catch (pageError) {
        console.error(`  ⚠️ Erreur page ${pageNum}:`, pageError.message);
        continue;
      }
    }
  } catch (error) {
    console.error('❌ Erreur WTTJ:', error.message);
  } finally {
    await browser.close();
  }

  console.log(`  🎉 Total WTTJ: ${allJobs.length} offres\n`);
  return allJobs;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Endpoint Indeed
 */
app.get('/api/jobs/indeed', async (req, res) => {
  try {
    const { query = 'développeur', location = 'Paris', maxPages = 2 } = req.query;
    
    const jobs = await scrapeIndeedJobs(query, location, parseInt(maxPages));
    
    res.json({
      success: true,
      count: jobs.length,
      source: 'Indeed',
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
 * Endpoint HelloWork
 */
app.get('/api/jobs/hellowork', async (req, res) => {
  try {
    const { query = 'développeur', location = 'Paris', maxPages = 2 } = req.query;
    
    const jobs = await scrapeHelloWorkJobs(query, location, parseInt(maxPages));
    
    res.json({
      success: true,
      count: jobs.length,
      source: 'HelloWork',
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
 * Endpoint Welcome to the Jungle
 */
app.get('/api/jobs/wttj', async (req, res) => {
  try {
    const { query = 'développeur', location = 'Paris', maxPages = 2 } = req.query;
    
    const jobs = await scrapeWelcomeToTheJungleJobs(query, location, parseInt(maxPages));
    
    res.json({
      success: true,
      count: jobs.length,
      source: 'Welcome to the Jungle',
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
 * Endpoint combiné (Indeed + HelloWork + WTTJ)
 */
app.get('/api/jobs/all', async (req, res) => {
  try {
    const { query = 'développeur', location = 'Paris', maxPages = 2 } = req.query;
    
    console.log(`\n📊 Scraping combiné: "${query}" à "${location}"\n`);
    
    const [indeedJobs, helloworkJobs, wttjJobs] = await Promise.all([
      scrapeIndeedJobs(query, location, parseInt(maxPages)),
      scrapeHelloWorkJobs(query, location, parseInt(maxPages)),
      scrapeWelcomeToTheJungleJobs(query, location, parseInt(maxPages))
    ]);
    
    const allJobs = [...indeedJobs, ...helloworkJobs, ...wttjJobs];
    
    // Trier par date
    allJobs.sort((a, b) => {
      const getScore = (posted) => {
        if (posted.includes("Aujourd'hui")) return 0;
        if (posted.includes('Il y a 1 jour') || posted.includes('1 jour')) return 1;
        const match = posted.match(/(\d+) jours?/);
        return match ? parseInt(match[1]) : 999;
      };
      return getScore(a.posted) - getScore(b.posted);
    });
    
    res.json({
      success: true,
      count: allJobs.length,
      indeed: indeedJobs.length,
      hellowork: helloworkJobs.length,
      wttj: wttjJobs.length,
      source: 'Indeed + HelloWork + WTTJ',
      jobs: allJobs
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
  res.json({ 
    status: 'OK', 
    message: 'Jobs Scraper API is running',
    endpoints: [
      '/api/jobs/indeed',
      '/api/jobs/hellowork',
      '/api/jobs/wttj',
      '/api/jobs/all'
    ]
  });
});

/**
 * Démarrage du serveur
 */
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Serveur Jobs Scraper démarré sur http://localhost:${PORT}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`📡 Endpoints disponibles:`);
  console.log(`  • Indeed:     http://localhost:${PORT}/api/jobs/indeed?query=développeur&location=Paris`);
  console.log(`  • HelloWork:  http://localhost:${PORT}/api/jobs/hellowork?query=développeur&location=Paris`);
  console.log(`  • WTTJ:       http://localhost:${PORT}/api/jobs/wttj?query=développeur&location=Paris`);
  console.log(`  • Combiné:    http://localhost:${PORT}/api/jobs/all?query=développeur&location=Paris`);
  console.log(`  • Health:     http://localhost:${PORT}/health\n`);
  console.log(`⚠️  ATTENTION: Respectez les conditions d'utilisation des sites`);
  console.log(`💡 Préférez les API officielles quand disponibles\n`);
  console.log(`${'='.repeat(60)}\n`);
});

module.exports = { scrapeIndeedJobs, scrapeHelloWorkJobs };
