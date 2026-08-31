const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';
const NACIONAL_CALENDARIO_URL = 'https://nacional.uy/futbol/primer-equipo/calendario';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Error: Faltan variables de entorno TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
    console.log('Notificación enviada a Telegram.');
  } catch (error) {
    console.error('Error al enviar a Telegram:', error.message);
  }
}

// 1. Consulta en ESPN
async function consultarESPN() {
  console.log('Consultando ESPN...');
  const { data } = await axios.get(ESPN_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000
  });

  const $ = cheerio.load(data);
  let partidoDetectado = false;
  const hoy = new Date().toLocaleDateString('es-UY', { timeZone: 'America/Montevideo' });

  $('tr').each((index, element) => {
    const textoFila = $(element).text().replace(/\s+/g, ' ').trim();
    const esLocal = /Nacional\s+(v|vs)\s+/i.test(textoFila);

    if (esLocal) {
      const celdas = $(element).find('td');
      let horaPartido = 'Hora a confirmar';

      celdas.each((i, td) => {
        const txt = $(td).text().trim();
        if (/\d{1,2}:\d{2}/.test(txt)) {
          horaPartido = txt;
        }
      });

      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> ${hoy}\n` +
        `⏰ <b>Hora fijada:</b> ${horaPartido}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en la zona de La Blanqueada.</i>`;

      enviarMensajeTelegram(mensaje);
      partidoDetectado = true;
      return false;
    }
  });

  return partidoDetectado;
}

// 2. Consulta en sitio oficial de Nacional
async function consultarNacionalOficial() {
  console.log('Consultando sitio oficial de Nacional con Puppeteer...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.goto(NACIONAL_CALENDARIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const hoyDate = new Date();
    const opcionesFecha = { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Montevideo' };
    const hoyTexto = hoyDate.toLocaleDateString('es-UY', opcionesFecha).toLowerCase();

    const partidoDeHoy = await page.evaluate((hoyTexto) => {
      const tarjetas = Array.from(document.querySelectorAll('div, article, section'));

      for (const tarjeta of tarjetas) {
        const lineas = tarjeta.innerText ? tarjeta.innerText.split('\n').map(l => l.trim()).filter(Boolean) : [];
        if (lineas.length < 3) continue;

        const fechaTarjeta = lineas[0].toLowerCase().replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();
        const hoyLimpio = hoyTexto.replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();

        if (!fechaTarjeta.includes(hoyLimpio)) continue;

        const idxHora = lineas.findIndex(l => /\d{1,2}\s*:\s*\d{2}/.test(l) || l.includes('- : -'));

        if (idxHora !== -1) {
          const equipoLocal = lineas[idxHora - 1] || '';
          const esLocal = equipoLocal.includes('Nacional');
          const horaMatch = lineas[idxHora].match(/(\d{1,2}:\d{2})/);
          const horaStr = horaMatch ? horaMatch[1] : 'Hora a confirmar';

          return { esLocal, hora: horaStr };
        }
      }
      return null;
    }, hoyTexto);

    if (partidoDeHoy && partidoDeHoy.esLocal) {
      const hoyFormateado = hoyDate.toLocaleDateString('es-UY', { timeZone: 'America/Montevideo' });

      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE (Vía Web Oficial)</b>\n\n` +
        `📅 <b>Fecha:</b> ${hoyFormateado}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDeHoy.hora}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en la zona de La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
      return true;
    }

    return false;

  } finally {
    if (browser) await browser.close();
  }
}

// Función de ejecución principal con captura total de errores
async function ejecutar() {
  let errorESPN = null;
  let errorOficial = null;

  // Intento 1: ESPN
  try {
    const detectadoESPN = await consultarESPN();
    if (detectadoESPN) return;
  } catch (err) {
    errorESPN = err.message;
    console.error('Falla en ESPN:', errorESPN);
  }

  // Intento 2: Sitio Oficial
  try {
    const detectadoOficial = await consultarNacionalOficial();
    if (detectadoOficial) return;
  } catch (err) {
    errorOficial = err.message;
    console.error('Falla en Sitio Oficial:', errorOficial);
  }

  // Si ambos métodos dieron error de conexión/código, notifica la falla técnica por Telegram
  if (errorESPN && errorOficial) {
    const mensajeError = 
      `⚠️ <b>ALERTA TÉCNICA - BOT NACIONAL</b>\n\n` +
      `No se pudo verificar la agenda de partidos de hoy debido a errores en ambas fuentes:\n` +
      `• <b>ESPN:</b> ${errorESPN}\n` +
      `• <b>Sitio Oficial:</b> ${errorOficial}\n\n` +
      `<i>Revisar manualmente si hay partido en el Parque Central hoy.</i>`;

    await enviarMensajeTelegram(mensajeError);
  }
}

ejecutar();
