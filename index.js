const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';
const NACIONAL_CALENDARIO_URL = 'https://nacional.uy/futbol/primer-equipo/calendario';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

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

// 1. Consulta en ESPN (Por posición: "Nacional v Rival")
async function consultarESPN() {
  console.log('Consultando ESPN...');
  const { data } = await axios.get(ESPN_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000
  });

  const $ = cheerio.load(data);
  let partidoDetectado = false;

  // Fecha de hoy para comparar (ejemplo: "31/8" o según formato de fecha en la tabla)
  const hoy = new Date().toLocaleDateString('es-UY', { timeZone: 'America/Montevideo' });

  $('tr').each((index, element) => {
    const textoFila = $(element).text().replace(/\s+/g, ' ').trim();

    // Verificamos que la fila contenga la condición de LOCAL: "Nacional v " o "Nacional vs "
    const esLocal = /Nacional\s+(v|vs)\s+/i.test(textoFila);

    if (esLocal) {
      // Extraer la hora de la celda correspondiente
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
      return false; // Corta el bucle
    }
  });

  return partidoDetectado;
}

// 2. Consulta en Web Oficial (Por posición en la tarjeta de HOY)
async function consultarNacionalOficial() {
  console.log('Consultando sitio oficial de Nacional con Puppeteer...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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

        // Validar fecha de la tarjeta
        const fechaTarjeta = lineas[0].toLowerCase().replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();
        const hoyLimpio = hoyTexto.replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();

        if (!fechaTarjeta.includes(hoyLimpio)) continue;

        // Buscar línea con hora o marcador (- : -)
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

async function ejecutar() {
  try {
    const detectadoESPN = await consultarESPN();
    if (!detectadoESPN) {
      console.log('No se detectó partido local en ESPN para hoy. Verificando sitio oficial...');
      await consultarNacionalOficial();
    }
  } catch (error) {
    console.error('Error en ESPN:', error.message);
    try {
      await consultarNacionalOficial();
    } catch (errOficial) {
      console.error('Error en sitio oficial:', errOficial.message);
    }
  }
}

ejecutar();
