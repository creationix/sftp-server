# NodeJS sftp-server

Have you ever mounted a remote system over ssh and wondered what protocol it used to transfer the files.

More than likely it was the sftp protocol (not to be confused with ftp or ftps or ftp over ssh).

In order to be able to mount embedded devices that don't have openssh or ftpd, I'm implementing just the sftp server protocol in JavaScript.

To test this, run the sftp.js file on one terminal:

    node sftp.js

Then in another terminal, try to mount it using `sshfs`.

    sudo mkdir /media/nodejs
    sudo chown tim:tim /media/nodejs
    sshfs -o directport=6000 localhost:/home/tim /media/nodejs

Then from there explore your new nodeJS powered filesystem.  If you hit a part of the protocol I haven't fully implemented, your sshfs client will lock hard.

To recover from a lock, force an umount in another tab.

    sudo umount /media/nodejs -l

Then force quit whatever process got hung by the stuck sshfs.

