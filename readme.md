# 🥋 TatamiCam · Sistema de Replay para Arbitragem de Judô

Sistema **offline** e **portátil** de revisão em vídeo (DVR) desenvolvido para a Federação de Judô do Amazonas (FEJAMA).  
Permite que árbitros e mesários revisem lances em tempo real, arrastando uma linha do tempo como no YouTube, **sem interromper a gravação ao vivo**. A câmera permanece ligada o tempo todo, pedindo permissão apenas uma única vez.

---

## ✨ Funcionalidades principais

- **Gravação contínua** em buffer circular (ajustável de 1 a 30 minutos)
- **Replay instantâneo** arrastando a barra vermelha – sem parar a live
- **Velocidades ajustáveis:** 0.25×, 0.5×, 1× e 2×
- **Salvamento do replay** como arquivo `.webm` com um clique
- **Câmera sempre ativa:** depois de autorizada, nunca mais pede permissão (ideal para uso em competições)
- **Suporte a múltiplas câmeras** (USB, IP, integrada, celular como webcam)
- **Resolução e FPS configuráveis** (SD, HD, Full HD ou original da câmera)
- **Indicadores visuais** de status (AO VIVO / DVR) e estimativa de uso de RAM
- **Interface responsiva** (funciona em notebooks, tablets e telas pequenas)
- **100% offline** – basta abrir o arquivo HTML em qualquer navegador moderno

---

## 🛠️ Stack & Tecnologias

| Tecnologia | Uso no projeto |
|------------|----------------|
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/html5/html5-original.svg" width="24"/> **HTML5** | Estrutura da interface e elementos multimídia |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/css3/css3-original.svg" width="24"/> **CSS3** | Estilização completa (layout, cores, animações, responsividade) |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg" width="24"/> **JavaScript** | Lógica de gravação, DVR, controles e gerenciamento de buffer |
| <img src="https://img.shields.io/badge/MediaRecorder-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="MediaRecorder"> | Captura e codificação do vídeo em tempo real (formato WebM) |
| <img src="https://img.shields.io/badge/getUserMedia-4285F4?style=flat-square&logo=webrtc&logoColor=white" alt="getUserMedia"> | Acesso à câmera e configuração de resolução/FPS |
| <img src="https://img.shields.io/badge/File%20System%20Access-34A853?style=flat-square&logo=files&logoColor=white" alt="File System Access"> | Salvamento avançado de arquivos (showSaveFilePicker) |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/blazor/blazor-original.svg" width="24"/> **Blob / URL.createObjectURL** | Construção do vídeo em memória para replay instantâneo |
| <img src="https://img.shields.io/badge/Font_Awesome-528DD7?style=flat-square&logo=fontawesome&logoColor=white" alt="Font Awesome"> | Ícones da interface |
| <img src="https://img.shields.io/badge/Google_Fonts-4285F4?style=flat-square&logo=googlefonts&logoColor=white" alt="Google Fonts"> | Tipografia "Barlow Condensed" (estilo esportivo) |
| <img src="https://img.shields.io/badge/CDN-CDNJS-E74C3C?style=flat-square&logo=cdnjs&logoColor=white" alt="CDNJS"> | Carregamento de Font Awesome via CDN |

> 📦 **Zero dependências de backend, banco de dados ou instalação.**  
> Tudo roda em um único arquivo `.html`, offline, direto no navegador.
---

## 🚀 Como usar

### 1. Abra o arquivo
Copie o arquivo `index.html` para o computador da competição.  
Abra-o com **Google Chrome, Edge ou Firefox** (navegadores modernos).  
**Não é necessário instalar nada.** Funciona diretamente do arquivo.

### 2. Permita a câmera (apenas na primeira vez)
Clique no botão **INICIAR**.  
O navegador pedirá permissão para usar a câmera.  
Escolha **"Permitir"**.  
> ⚠️ Essa permissão será lembrada enquanto o arquivo estiver aberto. Se você fechar e abrir novamente, a permissão continuará valendo, desde que o navegador não seja reiniciado completamente e o arquivo esteja no mesmo caminho.  
> Se precisar, o sistema mantém a câmera ligada mesmo quando a gravação é parada – a permissão permanece ativa.

### 3. Grave e revise
- Selecione a câmera desejada no painel inferior.
- Ajuste a **Resolução** e o **FPS** conforme necessário.
- Clique em **INICIAR** para começar a gravar.
- Para revisar um lance, **arraste a barra vermelha** (timeline) para o momento desejado.
- Use os botões **-5s / +5s** ou a barra de rolagem para navegar.
- Altere a velocidade de reprodução com os botões **0.25×, 0.5×, 1×, 2×**.
- Volte ao vivo a qualquer momento clicando em **"AO VIVO"** ao lado da timeline.
- Para salvar um replay, entre no modo **DVR** e clique em **SALVAR**.

### 4. Parar / Reiniciar gravação
- **PARAR** apenas interrompe a gravação (o buffer é limpo), mas **a câmera continua ligada**.
- Para gravar um novo combate, clique em **INICIAR** novamente – sem nova permissão de câmera.
- Ao final do evento, você pode desligar a câmera completamente com o botão **DESLIGAR CÂMERA** (aparece ao lado de PARAR quando a câmera está ativa).

---

## 🎮 Controles

| Botão             | Função                                           |
|-------------------|--------------------------------------------------|
| **INICIAR**       | Inicia a gravação (ou reabre a câmera se já ligada) |
| **PARAR**         | Interrompe a gravação e limpa o buffer (câmera continua) |
| **DESLIGAR CÂMERA** | Desliga completamente a câmera (para final de dia) |
| **PLAY / PAUSE**  | Pausa/retoma a live ou o replay                  |
| **-5s / +5s**     | Avança/retrocede 5 segundos no modo DVR          |
| **0.25× / 0.5× / 1× / 2×** | Velocidade do replay                |
| **SALVAR**        | Salva o replay como arquivo `.webm` (modo DVR ativo) |
| **Barra de tempo**| Arraste para navegar no buffer gravado           |
| **Atualizar lista** (ícone de rotação) | Recarrega a lista de câmeras          |

---

## ⚙️ Configurações personalizáveis

- **Câmera:** selecione entre as câmeras disponíveis (incluindo DroidCam, Iriun, etc.)
- **Buffer máximo:** de 1 a 30 minutos (padrão 5 min). Altere no slider com o ícone `i` para ajuda.
- **Resolução:** 640×480 (SD), 1280×720 (HD), 1920×1080 (Full HD) ou "Original da câmera"
- **FPS:** 15, 24, 30, 60 ou "Câmera padrão"

> ℹ️ A estimativa de tamanho do buffer e o aviso de RAM são atualizados em tempo real. Se o buffer ultrapassar 800 MB ou mais de 70% da RAM disponível, um alerta amarelo aparecerá – reduza o tempo de buffer ou a resolução.

---

## 💡 Dicas para uso em competições

- **Deixe a câmera ligada o dia todo** – isso evita novas solicitações de permissão.
- Use **resolução HD (720p)** para um bom equilíbrio entre qualidade e consumo de memória.
- Em computadores com pouca RAM (4 GB), mantenha o buffer em **3–5 minutos**.
- Conecte a câmera **antes** de abrir o sistema e use o botão de atualizar câmeras se trocar de dispositivo.
- O arquivo de replay é salvo no formato **WebM**, compatível com VLC, reprodutores modernos e editores de vídeo.

---

## 🔒 Privacidade e segurança

- **Nenhum dado é enviado pela internet.** O sistema funciona 100% offline.
- A gravação é armazenada **apenas na memória RAM** (buffer circular). Quando você para ou fecha a página, os dados são descartados, a menos que sejam salvos manualmente.
- A câmera nunca é acessada sem sua permissão explícita.

---

## 🛠️ Requisitos técnicos

- Navegador moderno: **Google Chrome 80+**, **Microsoft Edge 80+**, **Firefox 75+** (recomendado Chrome/Edge para melhor compatibilidade com WebM)
- Câmera reconhecida pelo sistema (USB, integrada ou aplicativo de webcam virtual como DroidCam, Iriun)
- Memória RAM: mínimo 4 GB recomendado
- Sistema operacional: Windows, macOS, Linux, ChromeOS

---

## 📁 Estrutura do arquivo

O sistema é um único arquivo HTML autocontido (`index.html`).  
Basta abri-lo em qualquer computador, sem instalar dependências.

---

## 👨‍💻 Desenvolvedor

<div align="center">
  <a href="https://github.com/renan-sena">
    <img src="https://github.com/renan-sena.png" width="100px" style="border-radius:50%" alt="Avatar do desenvolvedor">
  </a>
  <br>
  <strong>Renan Sena</strong><br>
  <a href="https://github.com/renan-sena">@renan-sena</a>
</div>

---

## 📝 Licença e créditos

Desenvolvido para a **Federação de Judô do Amazonas (FEJAMA)**.

---

**Dúvidas ou sugestões?** Entre em contato com a equipe técnica da FEJAMA.  
*Que venham as melhores decisões! 🥋*