const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const ical = require('ical-generator').default;

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/nacional.ics', async (req, res) => {
  let browser = null;
  try {
    const calendar = ical({ name: 'Alertas Parque Central' });

    // Inicia un navegador invisible para renderizar la web de Nacional
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Simula un navegador común para evitar bloqueos
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Visita la página oficial de calendario de Nacional
    await page.goto('https://nacional.uy/futbol/primer-equipo/calendario', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const content = await page.content();
    const $ = cheerio.load(content);

    // Recorre todos los contenedores o tarjetas de partidos en la web oficial
    $('article, .match-item, .fixture-card, .calendario-item, tr').each((i, el) => {
      const texto = $(el).text();

      // Detecta si en el bloque del partido figura el Gran Parque Central o si juega de local
      const esEnParque = texto.toLowerCase().includes('parque central') || 
                         texto.toLowerCase().includes('gran parque central') ||
                         texto.toLowerCase().includes('nacional vs');

      if (esEnParque && texto.length > 10) {
        // Intenta obtener la fecha del elemento de texto o etiqueta time
        const fechaAttr = $(el).find('time').attr('datetime');
        const fechaPartido = fechaAttr ? new Date(fechaAttr) : new Date();

        calendar.createEvent({
          start: fechaPartido,
          end: new Date(fechaPartido.getTime() + (2 * 60 * 60 * 1000)),
          summary: `🏠 LOCAL: Partido en el Gran Parque Central`,
          location: 'Gran Parque Central',
          description: '⚠️ Alerta de tránsito: Partido fijado en el Gran Parque Central según nacional.uy. Evitar la zona por cortes de calle.'
        });
      }
    });

    await browser.close();

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="nacional.ics"');
    res.send(calendar.toString());

  } catch (error) {
    if (browser) await browser.close();
    console.error('Error procesando la web oficial:', error);
    res.status(500).send('Error leyendo el calendario de nacional.uy');
  }
});

app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
