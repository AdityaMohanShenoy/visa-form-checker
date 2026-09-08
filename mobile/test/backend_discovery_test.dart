import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:visa_checker_mobile/services/backend_discovery.dart';

/// Serves the same shape as the real `/api/v1/health`.
Future<HttpServer> healthServer({String status = 'ok'}) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) async {
    request.response
      ..headers.contentType = ContentType.json
      ..write('{"status":"$status","version":"0.1.0"}');
    await request.response.close();
  });
  return server;
}

void main() {
  test('prefixOf trims the host octet', () {
    expect(BackendDiscovery.prefixOf('192.168.0.106'), '192.168.0.');
    expect(BackendDiscovery.prefixOf('nonsense'), isNull);
  });

  test('finds the backend by sweeping the subnet', () async {
    final server = await healthServer();
    addTearDown(() => server.close(force: true));

    final found = await BackendDiscovery.find(
      port: server.port,
      prefix: '127.0.0.',
    );

    expect(found, 'http://127.0.0.1:${server.port}');
  });

  test('ignores something else listening on the port', () async {
    final server = await healthServer(status: 'not-us');
    addTearDown(() => server.close(force: true));

    final found = await BackendDiscovery.find(
      port: server.port,
      prefix: '127.0.0.',
    );

    expect(found, isNull);
  });

  test('returns null when nothing on the subnet answers', () async {
    // Bind then release, so we have a port we know is closed.
    final probe = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final closedPort = probe.port;
    await probe.close(force: true);

    final found = await BackendDiscovery.find(
      port: closedPort,
      prefix: '127.0.0.',
    );

    expect(found, isNull);
  });

  test('an explicit subnet takes precedence over the fallback', () async {
    final server = await healthServer();
    addTearDown(() => server.close(force: true));

    // If precedence were inverted this would sweep 10.255.255.x and find
    // nothing, so a hit proves the explicit prefix won.
    final found = await BackendDiscovery.find(
      port: server.port,
      prefix: '127.0.0.',
      fallbackPrefix: '10.255.255.',
    );

    expect(found, 'http://127.0.0.1:${server.port}');
  });
}
