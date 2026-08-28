# Relatório de Correções e Análise — TatamiCam

**Data:** 2026-07-23
**Ambiente:** macOS 15.5 (Apple Silicon) · Tauri v2 · WKWebView
**Projeto:** `Tatamicam-app` (Sistema de Replay de Judô — FEJAMA)

---

## Sumário

Nesta sessão o app saiu de **não compilar** para **rodar com câmera, DVR e timeline funcionais**. Foram corrigidos 6 problemas (ambiente, build e bugs de runtime) e feita uma análise de performance para hardware modesto.

| # | Problema | Área | Status |
|---|----------|------|--------|
| 1 | Cargo antigo não suporta `edition2024` | Ambiente | ✅ Resolvido |
| 2 | `cargo` não encontrado pelo `tauri` (PATH) | Ambiente | ✅ Resolvido |
| 3 | Ícones ausentes (`generate_context!` falhava) | Build | ✅ Resolvido |
| 4 | Crash em `navigator.mediaDevices` (WKWebView) | Runtime | ✅ Resolvido |
| 5 | App não pedia permissão de câmera (mac/linux) | Config | ✅ Resolvido |
| 6 | DVR RAM duplicava cada segundo do buffer | Bug lógico | ✅ Resolvido |
| 7 | Crash em `TouchEvent` ao arrastar a timeline | Runtime | ✅ Resolvido |
| 8 | Análise de performance (4 GB RAM / i3 5ª ger.) | Análise | 📋 Documentado |

---

## 1. Toolchain Rust — `edition2024` não suportado

**Erro:** `feature 'edition2024' is required ... not stabilized in this version of Cargo (1.80.1)`

**Causa:** o `Cargo.toml` usa `edition = "2024"`, estabilizada só no Rust **1.85+**. O sistema tinha Rust 1.80.1 instalado via Homebrew, sem `rustup`.

**Correção:**
- Removido o Rust do Homebrew (`brew uninstall rust`).
- Instalado `rustup` → **Rust 1.97.1** (stable).

---

## 2. PATH — `cargo` não encontrado pelo `tauri`

**Erro:** `failed to run command cargo metadata: No such file or directory (os error 2)`

**Causa:** o instalador do `rustup` adicionou `. "$HOME/.cargo/env"` apenas ao `~/.profile`, que o **zsh não lê**. Logo `~/.cargo/bin` não entrava no PATH das sessões zsh.

**Correção:** adicionada a linha `. "$HOME/.cargo/env"` ao `~/.zshrc`.

---

## 3. Ícones ausentes

**Erro:** `failed to open icon .../src-tauri/icons/32x32.png: No such file or directory`

**Causa:** a pasta `src-tauri/icons/` não existia, mas o `tauri.conf.json` referencia 5 ícones que o macro `generate_context!` embute em tempo de compilação.

**Correção:** gerado o conjunto completo de ícones a partir de `app-icon.png` com `npx tauri icon app-icon.png`.

> ⚠️ **Observação:** o `app-icon.png` original é 195×195; o ideal são 1024×1024. Os ícones grandes ficaram levemente borrados (não impede o uso). Recomenda-se substituir por um logo em alta resolução e rodar `npx tauri icon` de novo.

---

## 4. Crash em `navigator.mediaDevices`

**Erro:** `TypeError: undefined is not an object (evaluating 'navigator.mediaDevices.addEventListener')`

**Causa:** no WKWebView do macOS, `navigator.mediaDevices` só existe em **contexto seguro**. O servidor de dev roda em `http://localhost:5173` (inseguro para o WKWebView) → `mediaDevices` fica `undefined`. A exceção em `bindEvents()` abortava o `initUI()`, deixando **vários botões sem handler** (ex.: "Pular tutorial").

**Correção** — `src/js/ui.ts`, guarda antes de usar a API:
```js
if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', () => { ... });
}
```

> A captura de câmera **funciona no build de produção** (carregado via protocolo `tauri://`, que é contexto seguro). No `tauri dev` do macOS o `mediaDevices` fica indisponível por causa do `http://localhost`.

---

## 5. Permissão de câmera para usuários mac e linux

**Objetivo:** o app precisa solicitar permissão de câmera ao usuário final.

**Correção** (afeta o **app compilado**):

- **`src-tauri/Info.plist`** (novo) — macOS exige a descrição de uso, senão o SO encerra o app ao acessar a câmera:
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription`
- **`src-tauri/Entitlements.plist`** (novo) — para builds assinados/notarizados:
  - `com.apple.security.device.camera`
  - `com.apple.security.device.audio-input`
- **`src-tauri/tauri.conf.json`** — referência aos entitlements:
  ```json
  "bundle": {
    "macOS": { "entitlements": "Entitlements.plist" }
  }
  ```

**Linux:** não há manifesto — o WebKitGTK/wry concede a permissão de mídia automaticamente, e como o WebKitGTK trata `localhost` como contexto seguro, a câmera funciona inclusive em modo dev.

**Como testar (macOS):** só tem efeito no bundle. Rodar `npm run build` e abrir o `.app` em `src-tauri/target/release/bundle/macos/`; no primeiro uso da câmera o macOS mostra o diálogo de permissão.

> Observação: o código usa `audio: false`, então na prática só a câmera é usada. A descrição de microfone foi mantida por precaução.

---

## 6. Bug do DVR — buffer RAM duplicando cada segundo

**Sintoma:** ao retroceder o vídeo no buffer RAM, ao chegar no ponto onde se entrou no DVR, o vídeo **repetia** cada segundo.

**Causa:** no modo RAM, cada chunk de 1s do `MediaRecorder` era anexado **duas vezes** ao `SourceBuffer` do DVR:
- uma vez em `ondataavailable` (via `feedDvrIfActive`);
- outra dentro do `pushChunk`, que **repetia** `feedDvrIfActive` **e** a contagem de `bufSec`/`bufBytes`.

Com `sourceBuffer.mode = 'sequence'`, o append repetido era colocado logo em seguida → cada segundo gravado *depois* de entrar no DVR aparecia duplicado. (O modo disco não tinha o bug porque não usa `pushChunk`.)

**Correção** — `src/js/camera.ts`, `pushChunk` passa a só guardar o chunk e aparar o buffer:
```js
function pushChunk(slot, blob) {
    // bufSec/bufBytes e o feed do DVR já são feitos em ondataavailable.
    slot.chunks.push(blob);
    trimBuffer(slot);
}
```

**Bônus:** como `bufSec` era contado em dobro no RAM, o indicador de duração do buffer mostrava o dobro do tempo real — também corrigido.

---

## 7. Crash em `TouchEvent` ao arrastar a timeline

**Erro:** `ReferenceError: Can't find variable: TouchEvent` em `pctFromEvent` / `startDrag`

**Causa:** `TouchEvent` não existe como variável global no WKWebView desktop do macOS. O `e instanceof TouchEvent` lançava `ReferenceError`, quebrando o arrastar da barra da timeline.

**Correção** — `src/js/ui.ts`, detecção por presença de propriedade (cross-platform, sem tocar no global inexistente):
```js
const x = ('touches' in e ? e.touches[0]?.clientX : e.clientX) ?? 0;
```

---

## 8. Análise de performance — 4 GB RAM + Intel i3 5ª geração

**Contexto do hardware:** 2 núcleos/4 threads, gráficos Intel HD 5500 (sem encoder VP9 por hardware).

### Veredito

| Cenário | Roda bem? |
|---|---|
| 1 câmera, 720p, buffer RAM 5 min (defaults) | ✅ Sim, no limite confortável |
| 2 câmeras, 720p | ⚠️ No limite — reduzir FPS e/ou usar disco |
| 3–4 câmeras 720p/30fps | ❌ Satura CPU e arrisca OOM |
| Buffer RAM em 30 min | ❌ Até 450 MB/câmera — risco de OOM |
| Delay ao vivo (FrameDelayer) ligado | ❌ Muito pesado nessa CPU |

### Gargalos principais

1. **CPU — encoding VP9 por software** (crítico). O HD 5500 não acelera VP9, então o `MediaRecorder` usa libvpx por software (~30–60% de um núcleo por stream 720p30). É o maior limitador.
2. **RAM — buffer em memória + picos transientes**. ~15 MB/min por câmera. Ao entrar no DVR, o `prepareReplaySource` copia o buffer inteiro antes de anexar ao `SourceBuffer` → pico de ~3× o tamanho do buffer.

### Recomendações priorizadas

1. **Trocar codec VP9 → H.264** (usa Intel QuickSync por hardware) ou, no mínimo, **VP8**. Maior ganho de CPU.
2. **Limitar buffer RAM** (reduzir teto do slider ou usar "Disco Circular" por padrão em máquinas fracas).
3. **Reduzir bitrate** de 2 Mbps para ~1–1,2 Mbps em 720p.
4. **Limitar câmeras simultâneas** a 1–2 nessa faixa de hardware.
5. **Manter o delay desligado** (default já é 0).
6. **Aliviar o pico de memória** do DVR/`onSave` (anexar chunks sem cópia intermediária completa).

### Ajustes menores
- `tlLoop` roda `refreshTL()` a ~60fps — pode limitar a ~10fps.
- `startStats` mantém um `requestAnimationFrame` contínuo além do `setInterval` de 1s.

> **Status:** análise documentada. As correções de performance (itens 1–3) **ainda não foram aplicadas** — aguardando aprovação.

---

## Arquivos alterados / criados

| Arquivo | Mudança |
|---|---|
| `~/.zshrc` | + `. "$HOME/.cargo/env"` (PATH do Rust) |
| `src-tauri/icons/*` | Conjunto de ícones gerado |
| `src-tauri/Info.plist` | **Novo** — permissões de câmera/microfone (macOS) |
| `src-tauri/Entitlements.plist` | **Novo** — entitlements de câmera/áudio |
| `src-tauri/tauri.conf.json` | + `bundle.macOS.entitlements` |
| `src/js/ui.ts` | Guarda de `mediaDevices` + correção de `TouchEvent` |
| `src/js/camera.ts` | Correção da duplicação de chunk no DVR RAM |
| `dist/js/*`, `dist/app-icon.png` | Recompilados (`npx tsc`) + ícone copiado |

---

## Pendências / próximos passos

- [ ] Aplicar correções de performance (codec H.264, teto de buffer, bitrate).
- [ ] Substituir `app-icon.png` por versão 1024×1024 e regenerar ícones.
- [ ] (Opcional) Configurar HTTPS no dev para testar câmera no `tauri dev` do macOS.
- [ ] Validar o fluxo de permissão rodando `npm run build` e abrindo o `.app`.
