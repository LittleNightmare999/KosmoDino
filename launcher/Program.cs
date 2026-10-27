// start.exe — запускает весь проект КосмоДино одной командой.
//
//   start.exe            подготовить окружение, поднять БД, собрать клиент и запустить сервер
//   start.exe --reset    то же, но пересоздать и заново наполнить базу данных
//   start.exe --test     прогнать автоматические тесты сервера и клиента
//   start.exe --stop     остановить контейнер базы данных
using System.Diagnostics;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;

namespace CosmoDino.Launcher;

internal static class Program
{
    private const int AppPort = 8000;
    // 127.0.0.1, а не localhost: на Windows имя localhost сначала пробует IPv6 и теряет ~200 мс
    private static readonly string Url = $"http://127.0.0.1:{AppPort}";

    private static string Root = "";
    private static string Backend => Path.Combine(Root, "backend");
    private static string Frontend => Path.Combine(Root, "frontend");
    private static string VenvPython => Path.Combine(Backend, ".venv", "Scripts", "python.exe");

    private static Process? _server;

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "КосмоДино";

        try
        {
            Root = FindRoot();
            Banner();

            if (args.Contains("--stop"))
            {
                Run("docker", "compose stop db", Root);
                return 0;
            }

            Step("Проверка инструментов");
            RequireTool("docker", "--version", "Docker Desktop: https://www.docker.com/products/docker-desktop/");
            RequireTool("python", "--version", "Python 3.12+: https://www.python.org/downloads/");
            RequireTool("npm", "--version", "Node.js 20+: https://nodejs.org/");

            EnsureDockerRunning();
            StartDatabase();
            EnsureBackend();

            if (args.Contains("--test"))
                return RunTests();

            Seed(args.Contains("--reset"));
            EnsureFrontend();
            return Serve();
        }
        catch (LauncherException ex)
        {
            Fail(ex.Message);
            return 1;
        }
    }

    // ---------- Этапы ----------

    private static void EnsureDockerRunning()
    {
        Step("Docker");
        if (Quiet("docker", "info") == 0) { Ok("Docker запущен"); return; }

        var desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Docker", "Docker", "Docker Desktop.exe");
        if (File.Exists(desktop))
        {
            Info("Запускаю Docker Desktop…");
            Process.Start(new ProcessStartInfo(desktop) { UseShellExecute = true });
        }
        else
        {
            Info("Запустите Docker Desktop вручную — жду…");
        }
        if (!WaitFor(() => Quiet("docker", "info") == 0, TimeSpan.FromMinutes(3)))
            throw new LauncherException("Docker не отвечает. Запустите Docker Desktop и повторите.");
        Ok("Docker запущен");
    }

    private static void StartDatabase()
    {
        Step("База данных PostgreSQL (Docker)");
        Must(Run("docker", "compose up -d db", Root), "не удалось запустить контейнер базы данных");
        Info("Ожидаю готовности базы…");
        bool healthy = WaitFor(() =>
            Capture("docker", "inspect -f {{.State.Health.Status}} cosmodino_db").Trim() == "healthy",
            TimeSpan.FromMinutes(2));
        if (!healthy) throw new LauncherException("PostgreSQL не перешёл в состояние healthy.");
        Ok("PostgreSQL готов: localhost:5433, база encyclopedia");
    }

    private static void EnsureBackend()
    {
        Step("Сервер: окружение Python");
        if (!File.Exists(VenvPython))
        {
            Info("Создаю виртуальное окружение backend/.venv…");
            Must(Run("python", "-m venv .venv", Backend), "не удалось создать виртуальное окружение");
        }
        var req = Path.Combine(Backend, "requirements.txt");
        var stamp = Path.Combine(Backend, ".venv", ".requirements.sha256");
        var hash = Sha256(File.ReadAllText(req));
        if (!File.Exists(stamp) || File.ReadAllText(stamp) != hash)
        {
            Info("Устанавливаю зависимости из requirements.txt…");
            Must(Run(VenvPython, "-m pip install --disable-pip-version-check -q -r requirements.txt", Backend),
                "pip install завершился с ошибкой");
            File.WriteAllText(stamp, hash);
        }
        Ok("Зависимости сервера установлены");
    }

    private static void Seed(bool reset)
    {
        Step(reset ? "Пересоздание и наполнение базы" : "Наполнение базы тестовыми данными");
        Must(Run(VenvPython, reset ? "-m app.seed.seed --reset" : "-m app.seed.seed", Backend),
            "ошибка наполнения базы данных");
        Ok("Учётные записи: alice (администратор), editor1, editor2, reader1, reader2 — пароль password123");
    }

    private static void EnsureFrontend()
    {
        Step("Клиент: сборка React");
        if (!Directory.Exists(Path.Combine(Frontend, "node_modules")))
        {
            Info("Устанавливаю npm-пакеты…");
            Must(Run("npm", "install --no-audit --no-fund", Frontend), "npm install завершился с ошибкой");
        }
        var dist = Path.Combine(Frontend, "dist", "index.html");
        if (!File.Exists(dist) || SourcesNewerThan(File.GetLastWriteTimeUtc(dist)))
        {
            Info("Собираю клиент (vite build)…");
            Must(Run("npm", "run build", Frontend), "сборка клиента завершилась с ошибкой");
        }
        Ok("Клиент собран: frontend/dist");
    }

    private static int Serve()
    {
        Step("Запуск сервера");
        if (PortBusy(AppPort))
            throw new LauncherException($"Порт {AppPort} занят. Закройте предыдущий запуск или другое приложение.");

        int workers = Math.Clamp(Environment.ProcessorCount, 2, 4);
        _server = StartProcess(VenvPython,
            $"-m uvicorn app.main:app --host 0.0.0.0 --port {AppPort} --workers {workers} --no-access-log",
            Backend);
        // сервер и его рабочие процессы завершатся вместе с окном лаунчера, даже если его закрыть крестиком
        JobObject.Attach(_server);
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; Shutdown(); Environment.Exit(0); };
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Shutdown();

        if (!WaitFor(() => Healthy(), TimeSpan.FromSeconds(60)))
        {
            Shutdown();
            throw new LauncherException("Сервер не ответил на /api/health за 60 секунд.");
        }
        Ok($"Сервер работает ({workers} рабочих процесса uvicorn)");
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"  Энциклопедия:      {Url}");
        Console.WriteLine($"  Документация API:  {Url}/docs");
        Console.ResetColor();
        Console.WriteLine("  Остановить: Ctrl+C (контейнер БД продолжит работу, start.exe --stop остановит его)");
        Console.WriteLine();
        Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
        _server.WaitForExit();
        return _server.ExitCode;
    }

    private static int RunTests()
    {
        Step("Тесты сервера (pytest)");
        int py = Run(VenvPython, "-m pytest", Backend);
        Step("Тесты клиента (vitest)");
        if (!Directory.Exists(Path.Combine(Frontend, "node_modules")))
            Must(Run("npm", "install --no-audit --no-fund", Frontend), "npm install завершился с ошибкой");
        int js = Run("npm", "test", Frontend);
        Console.WriteLine();
        if (py == 0 && js == 0) Ok("Все тесты пройдены");
        else Fail($"Есть упавшие тесты: pytest={py}, vitest={js}");
        return py == 0 && js == 0 ? 0 : 1;
    }

    // ---------- Вспомогательное ----------

    private static string FindRoot()
    {
        // exe лежит в корне проекта; при запуске из launcher/bin ищем вверх docker-compose.yml
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "docker-compose.yml")))
            dir = dir.Parent;
        if (dir == null)
            throw new LauncherException("Не найден docker-compose.yml — положите start.exe в корень проекта.");
        return dir.FullName;
    }

    private static bool SourcesNewerThan(DateTime built)
    {
        var src = Path.Combine(Frontend, "src");
        var files = Directory.EnumerateFiles(src, "*", SearchOption.AllDirectories)
            .Append(Path.Combine(Frontend, "index.html"))
            .Append(Path.Combine(Frontend, "package.json"));
        return files.Any(f => File.Exists(f) && File.GetLastWriteTimeUtc(f) > built);
    }

    private static ProcessStartInfo Psi(string file, string args, string cwd)
    {
        // npm на Windows — это .cmd, поэтому запускаем через cmd.exe
        bool viaCmd = file is "npm" or "npx";
        var psi = new ProcessStartInfo
        {
            FileName = viaCmd ? "cmd.exe" : file,
            Arguments = viaCmd ? $"/c {file} {args}" : args,
            WorkingDirectory = cwd,
            UseShellExecute = false,
        };
        psi.Environment["PYTHONIOENCODING"] = "utf-8";
        psi.Environment["PYTHONUTF8"] = "1";
        return psi;
    }

    private static Process StartProcess(string file, string args, string cwd) =>
        Process.Start(Psi(file, args, cwd)) ?? throw new LauncherException($"Не удалось запустить {file}");

    private static int Run(string file, string args, string cwd)
    {
        try
        {
            using var p = StartProcess(file, args, cwd);
            p.WaitForExit();
            return p.ExitCode;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            throw new LauncherException($"Команда «{file}» не найдена.");
        }
    }

    private static int Quiet(string file, string args)
    {
        try
        {
            var psi = Psi(file, args, Root);
            psi.RedirectStandardOutput = psi.RedirectStandardError = true;
            using var p = Process.Start(psi)!;
            p.StandardOutput.ReadToEnd();
            p.StandardError.ReadToEnd();
            p.WaitForExit();
            return p.ExitCode;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return -1;
        }
    }

    private static string Capture(string file, string args)
    {
        try
        {
            var psi = Psi(file, args, Root);
            psi.RedirectStandardOutput = psi.RedirectStandardError = true;
            using var p = Process.Start(psi)!;
            var output = p.StandardOutput.ReadToEnd();
            p.StandardError.ReadToEnd();
            p.WaitForExit();
            return output;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return "";
        }
    }

    private static void RequireTool(string tool, string args, string hint)
    {
        if (Quiet(tool, args) != 0)
            throw new LauncherException($"Не найден {tool}. Установите: {hint}");
        Ok($"{tool} найден");
    }

    private static bool Healthy()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            return http.GetAsync($"{Url}/api/health").Result.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static bool PortBusy(int port)
    {
        try
        {
            var l = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, port);
            l.Start();
            l.Stop();
            return false;
        }
        catch
        {
            return true;
        }
    }

    private static bool WaitFor(Func<bool> check, TimeSpan timeout)
    {
        var sw = Stopwatch.StartNew();
        while (sw.Elapsed < timeout)
        {
            if (check()) return true;
            Thread.Sleep(1000);
        }
        return false;
    }

    private static void Shutdown()
    {
        if (_server is { HasExited: false })
        {
            Info("Останавливаю сервер…");
            try { _server.Kill(entireProcessTree: true); } catch { /* уже завершён */ }
        }
    }

    private static string Sha256(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));

    private static void Must(int code, string message)
    {
        if (code != 0) throw new LauncherException(message);
    }

    private static void Banner()
    {
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine();
        Console.WriteLine("  КосмоДино — интерактивная энциклопедия космоса и динозавров");
        Console.ResetColor();
        Console.WriteLine("  Курсовой проект по дисциплине «Программная инженерия»");
        Console.WriteLine("  Гуляева Анастасия Павловна, группа 25-КБ-ПИ1");
        Console.WriteLine($"  Каталог проекта: {Root}");
    }

    private static void Step(string title)
    {
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine($"» {title}");
        Console.ResetColor();
    }

    private static void Ok(string s)
    {
        Console.ForegroundColor = ConsoleColor.Green;
        Console.Write("  ✓ ");
        Console.ResetColor();
        Console.WriteLine(s);
    }

    private static void Info(string s) => Console.WriteLine($"  … {s}");

    private static void Fail(string s)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"\n  ✗ {s}");
        Console.ResetColor();
        if (!Console.IsInputRedirected)
        {
            Console.WriteLine("  Нажмите Enter, чтобы закрыть окно.");
            Console.ReadLine();
        }
    }
}

internal sealed class LauncherException(string message) : Exception(message);
