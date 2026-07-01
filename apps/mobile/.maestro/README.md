# Flujos Maestro (e2e móvil)

Requiere el CLI de Maestro y un simulador/emulador o dispositivo conectado con
la app instalada (build de desarrollo, no Expo Go, para que `appId` coincida).

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro test apps/mobile/.maestro/login.yaml
maestro test apps/mobile/.maestro/escanear-manual-confirmar.yaml
```

Ambos flujos asumen el entorno local seedeado (`pnpm db:seed`): usuario
`auditor@adn.demo` / `adn12345` y el activo de placa `ADN-004804` en estado
pendiente. `escanear-manual-confirmar.yaml` usa el ingreso manual de código en
vez de la cámara, ya que Maestro no simula el escaneo de QR físico.
