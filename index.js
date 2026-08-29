const express = require('express');
const axios = require('axios');
const ical = require('ical-generator').default;

const app = express();
const PORT = process.env.PORT || 10000;

// Utiliza la variable de entorno o toma la clave directamente si no está configurada
const API_KEY = process.env.FOOTBALL_API_KEY || '961e65f5acf251c37901b322e53c3e65';
const TEAM_ID = 2356; // ID de Nacional de Uruguay

app.get('/nacional.ics', async (req, res) => {
  try {
    const calendar = ical({ name: 'Alertas Parque Central' });

    const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
      params: {
        team: TEAM_ID,
        next: 10
      },
      headers: {
        'x-apisports-key': API_KEY,
        'x-rapidapi-key': API_KEY
      },
      timeout: 10000
    });

    const matches = response.data.response || [];

    matches.forEach(match => {
      const isHome = match.teams.home.id === TEAM_ID;
      const venueName = (match.fixture.venue.name || '').toLowerCase();
      const isParqueCentral = isHome || venueName.includes('parque central') || venueName.includes('gran parque');

      if (isParqueCentral) {
        const matchDate = new Date(match.fixture.date);
        const endDate = new Date(matchDate.getTime() + (2 * 60 * 60 * 1000));
        
        const opponent = isHome ? match.teams.away.name : match.teams.home.name;
        const locationText = match.fixture.venue.name || 'Gran Parque Central';

        calendar.createEvent({
          start: matchDate,
          end: endDate,
          summary: `🏠 LOCAL: Nacional vs ${opponent}`,
          location: locationText,
          description: `⚠️ Alerta de tránsito: Partido confirmado. Torneo: ${match.league.name}.`
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

