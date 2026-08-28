const express = require('express');
const axios = require('axios');
const ical = require('ical-generator').default;

const app = express();
const PORT = process.env.PORT || 10000;

// Obtiene la API Key desde las variables de entorno de Render
const API_KEY = process.env.FOOTBALL_API_KEY; 
const TEAM_ID = 2356; // ID de Nacional de Uruguay

app.get('/nacional.ics', async (req, res) => {
  try {
    const calendar = ical({ name: 'Alertas Parque Central' });

    if (!API_KEY) {
      console.error('Error: No se ha configurado la API Key.');
      return res.status(500).send('Error de configuración en el servidor');
    }

    const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
      params: {
        team: TEAM_ID,
        next: 10
      },
      headers: {
        'x-apisports-key': API_KEY
      },
      timeout: 10000
    });

    const matches = response.data.response || [];

    matches.forEach(match => {
      const venueName = (match.fixture.venue.name || '').toLowerCase();
      const isHome = match.teams.home.id === TEAM_ID;

      if (isHome || venueName.includes('parque central')) {
        const matchDate = new Date(match.fixture.date);
        const endDate = new Date(matchDate.getTime() + (2 * 60 * 60 * 1000));

        calendar.createEvent({
          start: matchDate,
          end: endDate,
          summary: `🏠 LOCAL: Nacional vs ${match.teams.away.name}`,
          location: match.fixture.venue.name || 'Gran Parque Central',
          description: `⚠️ Alerta de tránsito: Partido confirmado por API-Football. Torneo: ${match.league.name}.`
        });
      }
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="nacional.ics"');
    res.send(calendar.toString());

  } catch (error) {
    console.error('Error al consultar API-Football:', error.message);
    res.status(500).send('Error generando el calendario');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
