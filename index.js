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
    console.log('Notificación enviada a Telegram con éxito.');
  } catch (error) {
    console.error('Error enviando a Telegram:', error.message);
  }
}

function obtenerFechaTexto() {
  const hoyUruguay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
  const dia = String(hoyUruguay.getDate()).padStart(2, '0');
  const mes = String(hoyUruguay.getMonth() + 1).padStart(2, '0');
  return `Hoy (${dia}/${mes})`;
}

async function probarSoloESPN() {
  console.log('--- PROBANDO EXTRACTION EXACTA EN ESPN ---');
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

    const partidoDetectado = await page.evaluate((diaNum) => {
      const filas = Array.from(document.querySelectorAll('tr'));
      
      for (const fila of filas) {
        const textoOriginal = fila.innerText || '';
        const txt = textoOriginal.replace(/\s+/g, ' ').trim();

        const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(txt);
        const esLocal = /Nacional\s+v\s+/i.test(txt);

        if (coincideDia && esLocal) {
          // Extrae hora
          const matchHora = txt.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
          const horaStr = matchHora ? matchHora[1].toUpperCase() : 'A confirmar';

          // Extrae el Torneo correctamente buscando en la fila completa
          let torneoStr = 'A confirmar / Desconocido';
          const celdas = Array.from(fila.querySelectorAll('td'));
          
          if (celdas.length > 0) {
            // Toma la última celda que tenga texto no vacío
            const textosCeldas = celdas.map(c => c.innerText.trim()).filter(Boolean);
            if (textosCeldas.length > 0) {
              torneoStr = textosCeldas[textosCeldas.length - 1];
            }
          }

          return { hora: horaStr, torneo: torneoStr };
        }
      }
      return null;
    }, diaNum);

    if (partidoDetectado) {
      console.log('¡Partido de hoy en ESPN encontrado con éxito!');
      const fechaTexto = obtenerFechaTexto();
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDetectado.hora}\n` +
        `🏆 <b>Torneo:</b> ${partidoDetectado.torneo}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> ESPN\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
    } else {
      console.log('No se detectó ningún partido de local para hoy en ESPN.');
    }

  } catch (err) {
    console.error('Error durante la ejecución:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

probarSoloESPN();
