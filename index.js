const axios = require('axios');
const cheerio = require('cheerio');

// Configuración desde Variables de Entorno de Render
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Error: Faltan las variables de entorno TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
    console.log('Notificación enviada a Telegram con éxito.');
  } catch (error) {
    console.error('Error al enviar mensaje a Telegram:', error.response ? error.response.data : error.message);
  }
}

async function verificarPartidoHoy() {
  console.log('Consultando calendario de ESPN...');
  try {
    const { data } = await axios.get(ESPN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(data);
    let partidoDetectado = false;

    // Recorremos todas las filas de las tablas de ESPN
    $('tr').each((index, element) => {
      const textoFila = $(element).text().replace(/\s+/g, ' ').trim();

      // Buscamos si la fila menciona el Gran Parque Central o Parque Central
      const tieneParque = /Gran Parque Central|Parque Central/i.test(textoFila);
      const esLocal = textoFila.includes('Nacional') && (textoFila.includes(' v ') || textoFila.includes(' vs '));

      if (tieneParque && esLocal) {
        const hoy = new Date().toLocaleDateString('es-UY', { timeZone: 'America/Montevideo' });

        const mensaje = 
          `<b>¡HOY JUEGA NACIONAL EN EL PARQUE!</b> 🔵⚪🔴\n\n` +
          `📅 <b>Fecha:</b> ${hoy}\n` +
          `🏟️ <b>Estadio:</b> Gran Parque Central\n` +
          `⚽ Revisa la fijación de horario para la partida.`;

        enviarMensajeTelegram(mensaje);
        partidoDetectado = true;
        return false; // Detiene el bucle en el primer partido encontrado
      }
    });

    if (!partidoDetectado) {
      console.log('Hoy no se detectó partido de Nacional en el Gran Parque Central.');
    }

  } catch (error) {
    console.error('Error al acceder a ESPN:', error.message);
  }
}

verificarPartidoHoy();

