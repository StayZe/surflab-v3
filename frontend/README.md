# Frontend SurfLab

Emplacement reserve au frontend du site. Aucun frontend n'a ete invente ou
remplace : le projet existant pourra etre depose ici lorsqu'il sera disponible.

Le navigateur ne doit jamais appeler directement les routes
`/api/servers/*`, car cela exposerait `SURFLAB_API_KEY`. Le flux attendu est :

```text
frontend -> backend du site -> API SurfLab v3
```

Le backend du site transmet un `ownerId` stable pour appliquer le quota par
utilisateur. Le frontend peut interroger son propre backend jusqu'au statut
`running`, puis afficher le `joinUrl`. Les statistiques `/api/stats/*` et le
catalogue `/api/maps` peuvent rester publics. Le contrat complet, les exemples
et les statuts sont decrits dans `../API.md`.
