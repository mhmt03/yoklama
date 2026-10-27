using Microsoft.AspNetCore.Mvc.Filters;
using System;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Filters
{
    public class AuditLogFilter : IAsyncActionFilter
    {
        private readonly AppDbContext _dbContext;

        public AuditLogFilter(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            // Execute the action first
            var executedContext = await next();

            // Log after successful or even failed actions, but only if the user is authenticated
            var user = context.HttpContext.User;
            if (user.Identity != null && user.Identity.IsAuthenticated)
            {
                try
                {
                    var username = user.Identity.Name ?? "Bilinmeyen";
                    var roles = user.Claims
                        .Where(c => c.Type == ClaimTypes.Role)
                        .Select(c => c.Value)
                        .ToList();
                    var rolesStr = string.Join(", ", roles);

                    var controller = context.RouteData.Values["controller"]?.ToString() ?? "";
                    var action = context.RouteData.Values["action"]?.ToString() ?? "";
                    var method = context.HttpContext.Request.Method;
                    var ip = context.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";

                    // Serialize action arguments for debugging/parameters
                    string parameters = "";
                    try
                    {
                        // Filter out sensitive parameters like 'password' if any
                        var safeArgs = context.ActionArguments
                            .Where(arg => !arg.Key.Contains("password", StringComparison.OrdinalIgnoreCase) && 
                                          !arg.Key.Contains("sifre", StringComparison.OrdinalIgnoreCase))
                            .ToDictionary(arg => arg.Key, arg => arg.Value);
                        parameters = JsonSerializer.Serialize(safeArgs);
                    }
                    catch
                    {
                        parameters = "[Serileştirme Hatası]";
                    }

                    // Truncate parameters if too long
                    if (parameters.Length > 2000)
                    {
                        parameters = parameters.Substring(0, 1997) + "...";
                    }

                    var log = new SystemLog
                    {
                        KullaniciAdi = username,
                        Rol = rolesStr,
                        ControllerName = controller,
                        ActionName = action,
                        Metot = method,
                        Parametreler = parameters,
                        IpAdresi = ip,
                        Tarih = DateTime.UtcNow
                    };

                    _dbContext.SystemLogs.Add(log);
                    await _dbContext.SaveChangesAsync();
                }
                catch
                {
                    // Fail silently to prevent user action from throwing due to logging failure
                }
            }
        }
    }
}
