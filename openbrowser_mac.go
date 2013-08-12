// +build darwin

package main

import(
	"os/exec"
)

func openBrowser(url string) {
	if os.GetEnv("SSH_CLIENT") != "" || os.GetEnv("SSH_TTY") != "" {
		// SSH environment variables means that the terminal is running through an secure
		//  shell session. We want to launch the browser where the display is located,
		//  not on the destination machine.
		fmt.Printf("%v\n", url)
		return
	}
	
	// Free desktop spec indicates that xdg-open should open any arbitrary provided URL
	cmd := exec.Command("open", url)
	err = cmd.Run()
	if err != nil {
		fmt.Printf("%v\n", url)
	}
}
