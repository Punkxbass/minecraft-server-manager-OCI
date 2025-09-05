const allowedCommands = {
  START_SERVER: { cmd: '/bin/systemctl', args: ['start', 'minecraft.service'] },
  STOP_SERVER: { cmd: '/bin/systemctl', args: ['stop', 'minecraft.service'] },
  RESTART_SERVER: { cmd: '/bin/systemctl', args: ['restart', 'minecraft.service'] },
  STATUS_SERVER: { cmd: '/bin/systemctl', args: ['status', 'minecraft.service', '--no-pager'] },
  CHECK_SCREEN: { cmd: '/usr/bin/screen', args: ['-list'] },
  INSTALL_PAPER: { cmd: '/home/ubuntu/install_paper.sh', args: [] },
  BAN_PLAYER: { cmd: '/usr/bin/screen', args: ['-S', 'minecraft-console', '-p', '0', '-X', 'stuff', 'ban '] },
  REBOOT_VPS: { cmd: '/usr/bin/sudo', args: ['/sbin/reboot'] }
};

module.exports = allowedCommands;
