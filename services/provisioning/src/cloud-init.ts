/**
 * Cloud-init template untuk VPS pelanggan.
 *
 * Kita pakai NousResearch/hermes-agent (MIT OSS) — install dari upstream script,
 * manage via systemd. Tidak ada custom build atau Docker image.
 *
 * Yang terjadi waktu VPS pertama boot:
 * 1. Create user `weuseai`
 * 2. Install Hermes Agent (`curl … install.sh | bash` as `weuseai`)
 * 3. Tulis /home/weuseai/.hermes/.env (chmod 0600) dengan Telegram + LLM creds
 * 4. Enable + start systemd unit hermes-agent.service (Restart=always)
 * 5. Tulis marker /opt/weuseai/ready
 */

export type Tier = 'starter' | 'pro'

export type CloudInitParams = {
  customerId: string
  telegramBotToken: string
  telegramAllowedUserIds: string  // comma-separated
  tier: Tier
  llmProxyToken?: string      // Starter only
  llmProxyUrl?: string        // Starter only
  customerLlmApiKey?: string  // Pro BYOK only
  customerLlmProvider?: 'deepseek' | 'openrouter' | 'openai' | 'glm'  // Pro BYOK only
}

function llmEnvLines(p: CloudInitParams): string[] {
  if (p.tier === 'starter') {
    return [
      `OPENAI_API_BASE=${p.llmProxyUrl ?? ''}`,
      `OPENAI_API_KEY=${p.llmProxyToken ?? ''}`,
      `HERMES_DEFAULT_MODEL=deepseek-chat`,
    ]
  }
  switch (p.customerLlmProvider) {
    case 'deepseek':
      return [`DEEPSEEK_API_KEY=${p.customerLlmApiKey ?? ''}`]
    case 'openrouter':
      return [`OPENROUTER_API_KEY=${p.customerLlmApiKey ?? ''}`]
    case 'openai':
      return [`OPENAI_API_KEY=${p.customerLlmApiKey ?? ''}`]
    case 'glm':
      return [`ZAI_API_KEY=${p.customerLlmApiKey ?? ''}`]
    default:
      return []
  }
}

export function buildCloudInit(params: CloudInitParams): string {
  const envLines = [
    `TELEGRAM_BOT_TOKEN=${params.telegramBotToken}`,
    `TELEGRAM_ALLOWED_USERS=${params.telegramAllowedUserIds}`,
    `TELEGRAM_REACTIONS=true`,
    ...llmEnvLines(params),
  ]
  const indentedEnv = envLines.map((l) => `      ${l}`).join('\n')

  return `#cloud-config
package_update: true
package_upgrade: false
packages:
  - curl
  - ca-certificates
  - sudo

users:
  - name: weuseai
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    home: /home/weuseai
    groups: users

write_files:
  - path: /home/weuseai/.hermes/.env
    permissions: '0600'
    owner: weuseai:weuseai
    content: |
${indentedEnv}

  - path: /etc/systemd/system/hermes-agent.service
    permissions: '0644'
    owner: root:root
    content: |
      [Unit]
      Description=Hermes Agent (NousResearch upstream)
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=simple
      User=weuseai
      Group=weuseai
      WorkingDirectory=/home/weuseai
      EnvironmentFile=/home/weuseai/.hermes/.env
      ExecStart=/home/weuseai/.local/bin/hermes gateway start
      Restart=always
      RestartSec=5

      [Install]
      WantedBy=multi-user.target

runcmd:
  - mkdir -p /home/weuseai/.hermes
  - chown -R weuseai:weuseai /home/weuseai/.hermes
  - su - weuseai -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash'
  - systemctl daemon-reload
  - systemctl enable hermes-agent.service
  - systemctl start hermes-agent.service
  - mkdir -p /opt/weuseai
  - echo "ready" > /opt/weuseai/ready
`
}
