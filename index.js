const axios = require('axios');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Error: Faltan variables TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
    console.log('Notificación enviada a Telegram con éxito.');
  } catch (error) {
    console.error('Error al enviar a Telegram:', error.message);
  }
}

function obtenerFechaTexto() {
  const hoyUruguay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
  const dia = String(hoyUruguay.getDate()).padStart(2, '0');
  const mes = String(hoyUruguay.getMonth() + 1).padStart(2, '0');
  return `Hoy (${dia}/${mes})`;
}

async function probarSoloESPN() {
  console.log('--- INICIANDO PRUEBA EXCLUSIVA DE ESPN CON PUPPETEER ---');
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    
    // Forzar la zona horaria de Montevideo en el navegador
    await page.emulateTimezone('America/Montevideo');

    await page.goto(ESPN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const hoyUruguay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
    const diaNum = hoyUruguay.getDate();
    const mesesEspn = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const mesTexto = mesesEspn[hoyUruguay.getMonth()];

    console.log(`Buscando en el DOM renderizado: Día [${diaNum}] y Mes [${mesTexto}]`);

    const partidoDetectado = await page.evaluate((diaNum, mesTexto) => {
      const filas = Array.from(document.querySelectorAll('tr'));
      
      for (const fila of filas) {
        const textoFilaOriginal = fila.innerText || '';
        const textoFila = textoFilaOriginal.replace(/\./g, '').replace(/\s+/g, ' ').toLowerCase().trim();

        if (!textoFila) continue;

        // Evalúa coincidencia de día, mes y localía (NAC v ...)
        const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(textoFila);
        const coincideMes = new RegExp(`\\b${mesTexto}\\b`).test(textoFila);
        const esLocal = /\bnac\b.*?\bv\b/.test(textoFila);

        if (coincideDia && coincideMes && esLocal) {
          const matchHora = textoFila.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/);
          const horaPartido = matchHora ? matchHora[1].toUpperCase().trim() : 'A confirmar';

          const celdas = fila.querySelectorAll('td');
          let torneoStr = 'A confirmar / Desconocido';
          if (celdas.length >= 4) {
            const txtCelda = celdas[celdas.length - 1].innerText.trim();
            if (txtCelda) torneoStr = txtCelda;
          }

          return { esLocal: true, hora: horaPartido, torneo: torneoStr };
        }
      }

      return null;
    }, diaNum, mesTexto);

    if (partidoDetectado && partidoDetectado.esLocal) {
      console.log('¡Partido detectado en ESPN!');
      const fechaTexto = obtenerFechaTexto();
      const mensaje = 
        `🚨 <b>PRUEBA ESPN: ALERTA DE TRÁFICO Y ZONA</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDetectado.hora}\n` +
        `🏆 <b>Torneo:</b> ${partidoDetectado.torneo}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> ESPN (Prueba con Puppeteer)\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
    } else {
      console.log('No se detectó ningún partido de Nacional como local para hoy en la tabla renderizada de ESPN.');
    }

  } catch (error) {
    console.error('Error durante la prueba de ESPN:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

probarSoloESPN();
