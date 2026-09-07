FROM moodlehq/moodle-php-apache:8.3

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public

COPY moodle /var/www/html
COPY ai-platform/docker/moodle-poc/install-moodle.sh /usr/local/bin/install-moodle-poc

RUN chmod +x /usr/local/bin/install-moodle-poc \
    && mkdir -p /var/www/moodledata \
    && chown -R www-data:www-data /var/www/html /var/www/moodledata
