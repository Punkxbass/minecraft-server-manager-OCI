const allowedCommands = {
  START_SERVER: { cmd: '/bin/systemctl', args: ['start', 'minecraft.service'] },
  STOP_SERVER: { cmd: '/bin/systemctl', args: ['stop', 'minecraft.service'] },
  RESTART_SERVER: { cmd: '/bin/systemctl', args: ['restart', 'minecraft.service'] },
  INSTALL_PAPER: { cmd: '/home/ubuntu/install_paper.sh', args: [] },
  BAN_PLAYER: { cmd: '/usr/local/bin/mc-ban-player', args: ['--player'] },
  REBOOT_VPS: { cmd: '/usr/bin/sudo', args: ['/sbin/reboot'] }
};

module.exports = allowedCommands;
