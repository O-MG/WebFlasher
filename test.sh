#!/bin/sh
# basic testing script for local debugging
# note you need https to even think of doing 
# web serial or web usb so make sure this is 
# setup and running... 

# nothing fancy just http-server (node) and
# mkcert to generate the certs. 

# easily available via apt and brew
# you probably want to run via screen

if [ ! -f "./localhost.pem" ]; then
	mkcert localhost
fi
http-server -S -C localhost.pem -K localhost-key.pem -g -c -t10
echo done

