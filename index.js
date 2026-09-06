const axios = require('axios');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error enviando a Telegram:', error.message);
  }
}

async function probarSoloESPN() {
  console.log('--- INICIANDO DIAGNÓSTICO ESPN CON PUPPETEER ---');
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.emulateTimezone('America/Montevideo');
    await page.goto(ESPN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const hoyUruguay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
    const diaNum = hoyUruguay.getDate();

    // Extrae y muestra las primeras 8 filas reales del DOM
    const filasDOM = await page.evaluate(() => {
      const filas = Array.from(document.querySelectorAll('tr'));
      return filas.map(f => f.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8);
    });

    console.log('--- TEXTO REAL EN FILAS DE ESPN ---');
    filasDOM.forEach((f, idx) => console.log(`Fila ${idx}: "${f}"`));

    // Búsqueda flexible: solo verifica que contenga el día actual y que sea local (NAC)
    const partidoDetectado = await page.evaluate((diaNum) => {
      const filas = Array.from(document.querySelectorAll('tr'));
      
      for (const fila of filas) {
        const txt = (fila.innerText || '').toLowerCase();
        
        // Verifica el número de día de hoy y que figure Nacional como local
        const tieneDia = new RegExp(`\\b${diaNum}\\b`).test(txt);
        const esLocal = txt.includes('nacional') || txt.includes('nac');
        const esVs = txt.includes(' v ') || txt.includes(' vs ');

        if (tieneDia && esLocal && esVs) {
          const matchHora = txt.match(/(\d{1,2}:\d{2})/);
          const horaStr = matchHora ? matchHora[1] : 'A confirmar';

          const celdas = fila.querySelectorAll('td');
          let torneo = 'A confirmar / Desconocido';
          if (celdas.length >= 3) {
            torneo = celdas[celdas.length - 1].innerText.trim();
          }

          return { hora: horaStr, torneo };
        }
      }
      return null;
    }, diaNum);

    if (partidoDetectado) {
      console.log('¡Coincidencia detectada!');
      const mensaje = 
        `🚨 <b>PRUEBA ESPN: ALERTA DE TRÁFICO Y ZONA</b>\n\n` +
        `📅 <b>Fecha:</b> Hoy (${diaNum}/09)\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDetectado.hora} hs\n` +
        `🏆 <b>Torneo:</b> ${partidoDetectado.torneo}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> ESPN (Puppeteer)\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
    } else {
      console.log('No se encontró coincidencia tras la lectura flexible.');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

probarSoloESPN();
