#!/usr/bin/env bash

# This function check if worker environment has all required variable setup
# Please add all the required variable name to $PROJECT_ROOT/scripts/required_ENVs.txt
check_required_variables() {
  while read -r line || [ -n "$line" ] ; do
    #skip if the line start with a # sign, treat it as comment out
    if [[ $line =~ ^#.* ]]; then
      continue
    fi
    if [ -z "${!line}" ]; then
      echo "$line is needed"
      VAR_MISSED=1
    fi
  done < "$PROJECT_ROOT/scripts/required_ENVs.txt"
  if [ $VAR_MISSED -eq 1 ]; then travis_terminate 1; fi
}

# This function install all required packages
 install_software () {
    # echo "Installing pythong3 aws-cli and ruby"
    # rvm use --install --default --binary ruby-2.7.0
    # sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-setuptools # chromium-bsu
    # python3 --version
    # pip3 --version
    # pip3 install --upgrade pip setuptools wheel 
    # pip3 install awscli --upgrade --user
    # aws --version
    # echo "Fetching GIT_TOKEN"
    # export AWS_ACCESS_KEY_ID=$INT_AWS_ACCESS_KEY_ID
    # export AWS_SECRET_ACCESS_KEY=$INT_AWS_SECRET_ACCESS_KEY
    # export GIT_TOKEN=$(aws secretsmanager get-secret-value --secret-id github/login --region us-east-1| jq .SecretString | jq fromjson |jq .GIT_TOKEN -r)
    
    # curl -sS -o - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
    # echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list
   # apt-get -y update
    apt-get -y install google-chrome
    sudo apt-get install toilet figlet
    sudo apt-get install wget libgtk-3-0 libdbus-glib-1-2 libxt6
    apt-get install xvfb -y
    #service xvfb start
    #which xvfb
    mkdir /tmp/.X11-unix
    sudo chmod 1777 /tmp/.X11-unix
    sudo chown root /tmp/.X11-unix/
   
  

 }

# This function install ruby gems
install_dependencies () {
    echo "Go to the root of this repo: $PROJECT_ROOT"
    cd $PROJECT_ROOT
    # echo "Installing ruby gems"
    # gem install bundler --version 1.16
    # bundle config --local clean false
    # bundle install
    # ruby -v
    # bundle --version
    # gem --version
    
    npm install
    echo "Npm list is" 
    npm list
    echo "Npm Version is" 
    npm --version
    echo "Node Version is" 
    node --version
    echo "Chrome version is"
    google-chrome --version
}