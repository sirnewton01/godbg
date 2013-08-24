# Introduction

Tired of using the plain gdb command-line tool to debug your Go/C/C++ applications. Godbg is a graphical web-based front end for gdb.

The web-based UI makes godbg multi-platform and easier to remotely access your debug sessions.

# Features

* Thread information
* Execution control (step, next, interrupt)
* Breakpoints (line and function, enable, disable)
* Console output
* Source code highlighting

# Installation Notes

Godbg uses the gdb MI (Machine Interface) to debug yor application. The MI changes from time to time. This version of godbg should work with gdb versions 7.5 and 7.6. Newer versions of Linux will often come with these versions of gdb but Windows and Mac need a little extra setup.

## Windows
Gdb is available on Windows in either MinGW or Cygwin. To install the MinGW version visit http://www.mingw.org/ to download and install the tool suite (mingw-get-setup.exe). Once MingW is installed run the "MinGW Installer" to add the mingw32-gdb package (under "All Packages"). Make sure to add the "C:\MinGW\bin" directory to your PATH so that godbg can pick it up.

## Mac OS X
The version of gdb on Mac OS X as part of Xcode is very old and will not work with godbg. Instead, you can download and compile the latest version of gdb from https://www.gnu.org/software/gdb/download/ and compile it using the Xcode compiler using "./configure && make"

### Mac Codesigning Problem
Mac OS X requires that the debugger binary is signed with a trusted certificate before it can take control of another process. If you see a message in the gdb console similar to "Unable to find Mach task port for process-id 12345: (os/kern) failure (0x5). (please check gdb is codesigned - see taskgated(8))" then you will need to follow these steps.

* Start the Keychain Access application (you can use Spotlight to find it)
* Select Keychain Access -> Certificate Assistant -> Create a Certificate...
    + Choose a name for the certificate
    + Set Identity Type to Self Signed Root
    + Set Certificate Type to Code Signing
    + Activate the "Let me override defaults" option
* Continue on to the "Specify a Location For The Certificate" page
    + Set Keychain to System
* Continue and create the certificate
* Double click on the newly created certificate
    + Set When using this certificate to Always Trust
* Restart the computer (yes, this is a required step)
* Sign the gdb binary by executing the following command
    + codesign -f -s "gdb-cert-name" "location-of-gdb-binary"


